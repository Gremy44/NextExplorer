package main

import (
	"crypto/sha256"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"
)

func (h *Host) locationStat(location string) (Entry, error) {
	if !isRemotePath(location) {
		return statEntry(location)
	}
	id, directory, err := parseRemoteLocation(location)
	if err != nil {
		return Entry{}, err
	}
	hub, err := h.remoteHub()
	if err != nil {
		return Entry{}, err
	}
	c, err := hub.connection(id)
	if err != nil {
		return Entry{}, err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	defer c.timeout()()
	return c.stat(directory)
}
func locationJoin(location, name string) string {
	if isRemotePath(location) {
		id, directory, _ := parseRemoteLocation(location)
		return remoteLocation(id, path.Join(directory, name))
	}
	return filepath.Join(location, name)
}
func (h *Host) locationList(location string) ([]Entry, error) {
	if !isRemotePath(location) {
		f, err := os.Open(location)
		if err != nil {
			return nil, err
		}
		defer f.Close()
		items, err := f.ReadDir(10001)
		if err != nil && err != io.EOF {
			return nil, err
		}
		if len(items) > 10000 {
			return nil, fmt.Errorf("dossier supérieur à 10 000 éléments")
		}
		result := []Entry{}
		for _, item := range items {
			entry, err := statEntry(filepath.Join(location, item.Name()))
			if err != nil {
				return nil, err
			}
			result = append(result, entry)
		}
		return result, nil
	}
	id, directory, err := parseRemoteLocation(location)
	if err != nil {
		return nil, err
	}
	hub, err := h.remoteHub()
	if err != nil {
		return nil, err
	}
	c, err := hub.connection(id)
	if err != nil {
		return nil, err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	defer c.timeout()()
	return c.list(directory)
}
func (h *Host) startRemoteJob(p Payload) (M, error) {
	if p.Mode != "copy" || p.Merge || (p.Conflict != "rename" && p.Conflict != "skip") {
		return nil, fmt.Errorf("transfert distant : copie uniquement, conserver les deux ou ignorer les conflits")
	}
	if len(p.Paths) == 0 || len(p.Paths) > 1000 {
		return nil, fmt.Errorf("sélectionnez de 1 à 1 000 sources")
	}
	destination, err := h.locationStat(p.Destination)
	if err != nil || destination.Type != "directory" {
		return nil, fmt.Errorf("dossier de destination indisponible")
	}
	if isRemotePath(p.Destination) {
		id, _, _ := parseRemoteLocation(p.Destination)
		hub, _ := h.remoteHub()
		c, err := hub.connection(id)
		if err != nil {
			return nil, err
		}
		if c.sftp == nil {
			return nil, fmt.Errorf("les envois nécessitent SFTP pour garantir la création sans écrasement")
		}
	}
	hub, err := h.remoteHub()
	if err != nil {
		return nil, err
	}
	hub.mu.Lock()
	p.RemoteServers = map[string]string{}
	for _, location := range append(append([]string{}, p.Paths...), p.Destination) {
		if isRemotePath(location) {
			id, _, parseErr := parseRemoteLocation(location)
			if parseErr != nil {
				hub.mu.Unlock()
				return nil, parseErr
			}
			profile, exists := hub.profiles[id]
			if !exists {
				hub.mu.Unlock()
				return nil, fmt.Errorf("connexion distante inconnue")
			}
			p.RemoteServers[id] = remoteIdentity(profile)
		}
	}
	hub.mu.Unlock()
	return h.startJob("remote", p)
}

type remoteCopyItem struct {
	source Entry
	target string
}
type lockedFTPReader struct {
	io.ReadCloser
	unlock func()
}

func (r *lockedFTPReader) Close() error {
	err := r.ReadCloser.Close()
	if r.unlock != nil {
		r.unlock()
		r.unlock = nil
	}
	return err
}
func (r *lockedFTPReader) Read(data []byte) (int, error) {
	if response, ok := r.ReadCloser.(interface{ SetDeadline(time.Time) error }); ok {
		_ = response.SetDeadline(time.Now().Add(30 * time.Second))
	}
	return r.ReadCloser.Read(data)
}

func (j *Job) remoteTransfer(p Payload) (any, error) {
	h := j.host
	items := []remoteCopyItem{}
	directories := []string{}
	sources := map[string]bool{}
	reserved := map[string]bool{}
	skipped := 0
	metadataBytes := 0
	ids := map[string]bool{}
	for _, location := range append(append([]string{}, p.Paths...), p.Destination) {
		if isRemotePath(location) {
			id, _, err := parseRemoteLocation(location)
			if err != nil {
				return nil, err
			}
			ids[id] = true
		}
	}
	hub, err := h.remoteHub()
	if err != nil {
		return nil, err
	}
	if err := h.checkRemoteIdentity(p); err != nil {
		return nil, err
	}
	destination, destinationErr := h.locationStat(p.Destination)
	if destinationErr != nil || destination.Type != "directory" {
		return nil, fmt.Errorf("la destination n’est plus un dossier accessible")
	}
	for id := range ids {
		c, err := hub.connection(id)
		if err != nil {
			return nil, err
		}
		if remoteIdentity(c.profile) != p.RemoteServers[id] {
			return nil, fmt.Errorf("connexion distante remplacée depuis la mise en file")
		}
		j.remoteConnections = append(j.remoteConnections, c)
	}
	stop := make(chan struct{})
	defer close(stop)
	go func() {
		select {
		case <-stop:
			return
		case <-j.ctx.Done():
			select {
			case <-stop:
				return
			default:
			}
			for _, c := range j.remoteConnections {
				c.Close()
			}
		}
	}()
	var plan func(string, string, int) error
	plan = func(source, target string, depth int) error {
		if err := j.check(); err != nil {
			return err
		}
		if depth > 64 || len(items)+len(directories) >= 10000 {
			return fmt.Errorf("transfert limité à 10 000 éléments et 64 niveaux")
		}
		entry, err := h.locationStat(source)
		if err != nil {
			return err
		}
		metadataBytes += len(entry.Path) + len(target) + len(entry.Name) + 256
		if metadataBytes > 8<<20 {
			return fmt.Errorf("plan de transfert supérieur à 8 Mio ; fractionnez la sélection")
		}
		if entry.Type == "symlink" {
			return fmt.Errorf("lien symbolique refusé : %s", entry.Name)
		}
		if entry.Size < 0 || entry.Size > 1<<43 {
			return fmt.Errorf("taille de fichier hors limite (8 Tio maximum)")
		}
		if err := validName(entry.Name); err != nil {
			return fmt.Errorf("nom incompatible avec Windows : %s", entry.Name)
		}
		sources[source] = true
		if entry.Type == "directory" {
			directories = append(directories, target)
			children, err := h.locationList(source)
			if err != nil {
				return err
			}
			for _, child := range children {
				if err := plan(child.Path, locationJoin(target, child.Name), depth+1); err != nil {
					return err
				}
			}
		} else {
			items = append(items, remoteCopyItem{entry, target})
			j.mu.Lock()
			j.Total += entry.Size * 2
			j.mu.Unlock()
		}
		return nil
	}
	for _, source := range p.Paths {
		entry, err := h.locationStat(source)
		if err != nil {
			return nil, err
		}
		name := entry.Name
		target := locationJoin(p.Destination, name)
		if entry.Type == "directory" && !isRemotePath(source) && !isRemotePath(target) {
			relative, err := filepath.Rel(source, target)
			if err == nil && (relative == "." || relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator))) {
				return nil, fmt.Errorf("la destination est dans la source")
			}
		}
		if isRemotePath(source) && isRemotePath(target) {
			a, from, _ := parseRemoteLocation(source)
			b, to, _ := parseRemoteLocation(target)
			if a == b && (to == from || strings.HasPrefix(to, from+"/")) {
				return nil, fmt.Errorf("la destination est dans la source")
			}
		}
		// Check all collisions before creating any destination.
		for n := 1; ; n++ {
			_, existsErr := h.locationStat(target)
			exists := existsErr == nil || reserved[strings.ToLower(target)]
			if existsErr != nil && !os.IsNotExist(existsErr) {
				return nil, existsErr
			}
			if !exists {
				break
			}
			if p.Conflict == "skip" {
				j.recordTransfer(source, target, "skipped")
				target = ""
				skipped++
				break
			}
			if n > 10000 {
				return nil, fmt.Errorf("trop de noms en conflit")
			}
			ext := path.Ext(name)
			target = locationJoin(p.Destination, fmt.Sprintf("%s (%d)%s", strings.TrimSuffix(name, ext), n, ext))
		}
		if target == "" {
			continue
		}
		reserved[strings.ToLower(target)] = true
		if err := plan(source, target, 0); err != nil {
			return nil, err
		}
	}
	// Never copy a parent directory into itself through another selected source.
	for _, directory := range directories {
		if sources[directory] {
			return nil, fmt.Errorf("source et destination se recouvrent")
		}
	}
	if err := j.checkpoint(0, true, nil); err != nil {
		return nil, err
	}
	for _, directory := range directories {
		if err := j.check(); err != nil {
			return nil, err
		}
		if err := h.locationMkdir(directory); err != nil {
			return nil, fmt.Errorf("création du dossier : %w", err)
		}
	}
	copied := 0
	for _, item := range items {
		if err := j.copyRemoteFile(item); err != nil {
			return M{"copied": copied, "skipped": skipped}, err
		}
		copied++
		j.recordTransfer(item.source.Path, item.target, "copied")
	}
	return M{"copied": copied, "skipped": skipped, "verified": "SHA-256", "directoriesCreated": len(directories)}, nil
}
func (h *Host) locationMkdir(location string) error {
	if !isRemotePath(location) {
		return os.Mkdir(location, 0755)
	}
	id, directory, err := parseRemoteLocation(location)
	if err != nil {
		return err
	}
	hub, err := h.remoteHub()
	if err != nil {
		return err
	}
	c, err := hub.connection(id)
	if err != nil {
		return err
	}
	return c.sftp.Mkdir(directory)
}
func (h *Host) locationOpen(location string) (io.ReadCloser, error) {
	if !isRemotePath(location) {
		return os.Open(location)
	}
	id, directory, err := parseRemoteLocation(location)
	if err != nil {
		return nil, err
	}
	hub, err := h.remoteHub()
	if err != nil {
		return nil, err
	}
	c, err := hub.connection(id)
	if err != nil {
		return nil, err
	}
	if c.sftp != nil {
		return c.sftp.Open(directory)
	}
	c.mu.Lock()
	reader, err := c.ftp.Retr(directory)
	if err != nil {
		c.mu.Unlock()
		return nil, err
	}
	return &lockedFTPReader{ReadCloser: reader, unlock: c.mu.Unlock}, nil
}
func (j *Job) copyRemoteFile(item remoteCopyItem) (failure error) {
	if err := j.check(); err != nil {
		return err
	}
	h := j.host
	actual, err := h.locationStat(item.source.Path)
	if err != nil || actual != item.source {
		return fmt.Errorf("source modifiée avant transfert : %s", item.source.Name)
	}
	reader, err := h.locationOpen(item.source.Path)
	if err != nil {
		return err
	}
	defer reader.Close()
	target := item.target
	temporary := target + ".nxe-" + randomID() + ".part"
	var writer io.WriteCloser
	var publish func() error
	var cleanup func() error
	if isRemotePath(target) {
		id, to, _ := parseRemoteLocation(target)
		_, tmp, _ := parseRemoteLocation(temporary)
		hub, _ := h.remoteHub()
		c, connectErr := hub.connection(id)
		if connectErr != nil {
			return connectErr
		}
		writer, err = c.sftp.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_EXCL)
		publish = func() error { return c.sftp.Rename(tmp, to) }
		cleanup = func() error { return c.sftp.Remove(tmp) }
	} else {
		writer, err = os.OpenFile(temporary, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
		publish = func() error { return publishFile(temporary, target) }
		cleanup = func() error { return os.Remove(temporary) }
	}
	if err != nil {
		return err
	}
	defer func() {
		if err := cleanup(); err != nil && !os.IsNotExist(err) {
			if failure == nil {
				failure = fmt.Errorf("nettoyage du fichier temporaire : %w", err)
			}
			failure = fmt.Errorf("%w ; fichier temporaire à contrôler : %s", failure, temporary)
		}
	}()
	sourceHash := sha256.New()
	buffer := make([]byte, 128*1024)
	copied, copyErr := j.remoteCopy(io.MultiWriter(writer, sourceHash), io.LimitReader(reader, item.source.Size+1), buffer)
	closeErr := writer.Close()
	_ = reader.Close()
	if copyErr != nil {
		return copyErr
	}
	if closeErr != nil {
		return closeErr
	}
	if copied != item.source.Size {
		return fmt.Errorf("taille source modifiée pendant le transfert")
	}
	actual, err = h.locationStat(item.source.Path)
	if err != nil || actual != item.source {
		return fmt.Errorf("source modifiée pendant le transfert")
	}
	verify, err := h.locationOpen(temporary)
	if err != nil {
		return err
	}
	destinationHash := sha256.New()
	verified, err := j.remoteCopy(destinationHash, verify, buffer)
	closeErr = verify.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	if verified != copied || string(destinationHash.Sum(nil)) != string(sourceHash.Sum(nil)) {
		return fmt.Errorf("vérification SHA-256 échouée ; copie non publiée")
	}
	if err := j.check(); err != nil {
		return err
	}
	return publish()
}
func (j *Job) remoteCopy(writer io.Writer, reader io.Reader, buffer []byte) (int64, error) {
	var total int64
	for {
		if err := j.check(); err != nil {
			return total, err
		}
		timer := time.AfterFunc(30*time.Second, func() {
			for _, c := range j.remoteConnections {
				c.Close()
			}
		})
		n, err := reader.Read(buffer)
		if n > 0 {
			written, writeErr := writer.Write(buffer[:n])
			timer.Stop()
			total += int64(written)
			j.progress(int64(written))
			if writeErr != nil {
				return total, writeErr
			}
			if written != n {
				return total, io.ErrShortWrite
			}
		} else {
			timer.Stop()
		}
		if err == io.EOF {
			return total, nil
		}
		if err != nil {
			return total, err
		}
	}
}
