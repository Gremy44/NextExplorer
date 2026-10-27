package main

import (
	"context"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"path"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/jlaffaye/ftp"
	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

type remoteConnection struct {
	mu        sync.Mutex
	profile   remoteProfile
	ssh       *ssh.Client
	sftp      *sftp.Client
	ftp       *ftp.ServerConn
	socket    net.Conn
	closed    atomic.Bool
	closeOnce sync.Once
}
type remoteTrustError struct{ Fingerprint string }

func (e *remoteTrustError) Error() string { return "vérification de la clé SSH requise" }

func dialRemote(p remoteProfile, secret, accepted string, tlsConfig *tls.Config) (*remoteConnection, string, error) {
	c := &remoteConnection{profile: p}
	address := net.JoinHostPort(p.Host, strconv.Itoa(p.Port))
	if p.Protocol == "sftp" {
		methods := []ssh.AuthMethod{}
		if p.KeyFile != "" {
			info, err := os.Stat(p.KeyFile)
			if err != nil || !info.Mode().IsRegular() || info.Size() > 128*1024 {
				return nil, "", fmt.Errorf("clé privée locale illisible ou trop volumineuse")
			}
			data, err := os.ReadFile(p.KeyFile)
			if err != nil {
				return nil, "", fmt.Errorf("clé privée locale illisible")
			}
			signer, err := ssh.ParsePrivateKey(data)
			if err != nil && secret != "" {
				signer, err = ssh.ParsePrivateKeyWithPassphrase(data, []byte(secret))
			}
			if err != nil {
				return nil, "", fmt.Errorf("clé privée ou phrase secrète invalide")
			}
			methods = append(methods, ssh.PublicKeys(signer))
		} else {
			methods = append(methods, ssh.Password(secret))
		}
		expected := p.Fingerprint
		if expected == "" {
			expected = accepted
		}
		seen := ""
		config := &ssh.ClientConfig{User: p.Username, Auth: methods, Timeout: 12 * time.Second, HostKeyCallback: func(_ string, _ net.Addr, key ssh.PublicKey) error {
			seen = ssh.FingerprintSHA256(key)
			if expected == "" {
				return &remoteTrustError{seen}
			}
			if expected != seen {
				return fmt.Errorf("clé SSH différente de la clé approuvée : connexion bloquée")
			}
			return nil
		}}
		socket, err := net.DialTimeout("tcp", address, 12*time.Second)
		if err != nil {
			return nil, "", fmt.Errorf("serveur SSH inaccessible : %w", err)
		}
		c.socket = socket
		_ = socket.SetDeadline(time.Now().Add(15 * time.Second))
		client, channels, requests, err := ssh.NewClientConn(socket, address, config)
		if err != nil {
			socket.Close()
			if expected == "" && seen != "" {
				return nil, seen, &remoteTrustError{seen}
			}
			return nil, "", fmt.Errorf("connexion SSH refusée : %w", err)
		}
		c.ssh = ssh.NewClient(client, channels, requests)
		c.sftp, err = sftp.NewClient(c.ssh, sftp.MaxConcurrentRequestsPerFile(8))
		if err != nil {
			c.Close()
			return nil, "", fmt.Errorf("sous-système SFTP indisponible")
		}
		_ = socket.SetDeadline(time.Time{})
		c.profile.Fingerprint = seen
		go func() { _ = c.ssh.Wait(); c.closed.Store(true) }()
	} else {
		var control sync.Once
		options := []ftp.DialOption{ftp.DialWithTimeout(12 * time.Second), ftp.DialWithContext(context.Background()), ftp.DialWithDialFunc(func(network, address string) (net.Conn, error) {
			socket, err := net.DialTimeout(network, address, 12*time.Second)
			if err == nil {
				control.Do(func() { c.socket = socket; _ = socket.SetDeadline(time.Now().Add(15 * time.Second)) })
			}
			return socket, err
		})}
		if p.Protocol == "ftps" {
			if tlsConfig == nil {
				tlsConfig = &tls.Config{MinVersion: tls.VersionTLS12, ServerName: p.Host}
			}
			options = append(options, ftp.DialWithExplicitTLS(tlsConfig))
		}
		var err error
		c.ftp, err = ftp.Dial(address, options...)
		if err != nil {
			return nil, "", fmt.Errorf("connexion FTP/FTPS impossible : %w", err)
		}
		if err = c.ftp.Login(p.Username, secret); err != nil {
			c.Close()
			var certificate *tls.CertificateVerificationError
			if errors.As(err, &certificate) {
				return nil, "", fmt.Errorf("certificat TLS non reconnu ou non valable : connexion bloquée")
			}
			return nil, "", fmt.Errorf("identifiants FTP/FTPS refusés")
		}
		_ = c.socket.SetDeadline(time.Time{})
	}
	return c, "", nil
}
func (c *remoteConnection) Close() {
	c.closeOnce.Do(func() {
		c.closed.Store(true)
		if c.socket != nil {
			_ = c.socket.Close()
		}
		if c.sftp != nil {
			_ = c.sftp.Close()
		}
		if c.ssh != nil {
			_ = c.ssh.Close()
		}
		if c.ftp != nil {
			_ = c.ftp.Quit()
		}
	})
}
func (c *remoteConnection) timeout() func() {
	timer := time.AfterFunc(30*time.Second, c.Close)
	return func() { timer.Stop() }
}
func remoteEntry(p remoteProfile, name, directory string, bytes int64, modified time.Time, kind string, mode uint32) Entry {
	return Entry{Name: name, Path: remoteLocation(p.ID, directory), Type: kind, Size: bytes, Mtime: modified.Unix(), Ext: strings.ToLower(path.Ext(name)), Stamp: fmt.Sprintf("%d:%d:%o", modified.UnixNano(), bytes, mode)}
}
func (c *remoteConnection) stat(directory string) (Entry, error) {
	if c.sftp != nil {
		info, err := c.sftp.Lstat(directory)
		if err != nil {
			return Entry{}, err
		}
		kind := "file"
		if info.IsDir() {
			kind = "directory"
		}
		if info.Mode()&os.ModeSymlink != 0 {
			kind = "symlink"
		}
		return remoteEntry(c.profile, info.Name(), directory, info.Size(), info.ModTime(), kind, uint32(info.Mode().Perm())), nil
	}
	if directory == "/" {
		return remoteEntry(c.profile, "/", directory, 0, time.Unix(0, 0), "directory", 0), nil
	}
	info, err := c.ftp.GetEntry(directory)
	if err != nil {
		return Entry{}, err
	}
	if info.Size > 1<<53 {
		return Entry{}, fmt.Errorf("taille FTP hors limite")
	}
	return c.ftpEntry(info, directory), nil
}
func (c *remoteConnection) ftpEntry(info *ftp.Entry, directory string) Entry {
	kind := "file"
	if info.Type == ftp.EntryTypeFolder {
		kind = "directory"
	}
	if info.Type == ftp.EntryTypeLink {
		kind = "symlink"
	}
	return remoteEntry(c.profile, path.Base(directory), directory, int64(info.Size), info.Time, kind, 0)
}
func (c *remoteConnection) list(directory string) ([]Entry, error) {
	entries := []Entry{}
	if c.sftp != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		infos, err := c.sftp.ReadDirContext(ctx, directory)
		if err != nil {
			return nil, err
		}
		if len(infos) > 10000 {
			return nil, fmt.Errorf("dossier distant supérieur à 10 000 éléments")
		}
		for _, info := range infos {
			if info.Size() < 0 || !remoteName(info.Name()) {
				return nil, fmt.Errorf("entrée distante invalide")
			}
			kind := "file"
			if info.IsDir() {
				kind = "directory"
			}
			if info.Mode()&os.ModeSymlink != 0 {
				kind = "symlink"
			}
			entries = append(entries, remoteEntry(c.profile, info.Name(), path.Join(directory, info.Name()), info.Size(), info.ModTime(), kind, uint32(info.Mode().Perm())))
		}
	} else {
		infos, err := c.ftp.List(directory)
		if err != nil {
			return nil, err
		}
		if len(infos) > 10000 {
			return nil, fmt.Errorf("dossier distant supérieur à 10 000 éléments")
		}
		for _, info := range infos {
			if info.Name == "." || info.Name == ".." {
				continue
			}
			if !remoteName(info.Name) || info.Size > 1<<53 {
				return nil, fmt.Errorf("entrée FTP invalide")
			}
			entries = append(entries, c.ftpEntry(info, path.Join(directory, info.Name)))
		}
	}
	return entries, nil
}
func remoteName(name string) bool {
	return name != "" && name != "." && name != ".." && !strings.ContainsAny(name, "/\\\x00\r\n") && len(name) <= 1024
}
func (hub *remoteHub) connection(id string) (*remoteConnection, error) {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	c := hub.sessions[id]
	if c == nil || c.closed.Load() {
		return nil, fmt.Errorf("serveur déconnecté ; reconnectez-le depuis Serveurs")
	}
	return c, nil
}
func (h *Host) remoteRequest(r Request) (any, error) {
	var p remotePayload
	if json.Unmarshal(r.Payload, &p) != nil {
		return nil, fmt.Errorf("requête distante invalide")
	}
	hub, err := h.remoteHub()
	if err != nil {
		return nil, err
	}
	switch r.Action {
	case "REMOTE_PROFILES":
		hub.mu.Lock()
		defer hub.mu.Unlock()
		return hub.publicProfiles(), nil
	case "REMOTE_PROFILE_SAVE":
		profile, err := validateRemoteProfile(p.Profile)
		if err != nil {
			return nil, err
		}
		hub.mu.Lock()
		defer hub.mu.Unlock()
		old, exists := hub.profiles[profile.ID]
		same := exists && old.Host == profile.Host && old.Port == profile.Port && old.Protocol == profile.Protocol && old.Username == profile.Username
		if exists && (!same || old.KeyFile != profile.KeyFile || p.Password != "") && h.remoteBusy(profile.ID) {
			return nil, fmt.Errorf("terminez ou arrêtez le transfert avant de modifier la connexion")
		}
		profile.Secret = ""
		profile.Fingerprint = ""
		if same {
			profile.Fingerprint = old.Fingerprint
			if p.Remember && p.Password == "" {
				profile.Secret = old.Secret
			}
		}
		if !exists && len(hub.profiles) >= 50 {
			return nil, fmt.Errorf("50 connexions maximum")
		}
		if len(p.Password) > 8192 {
			return nil, fmt.Errorf("secret trop long")
		}
		if p.Remember && p.Password != "" {
			profile.Secret, err = protectRemoteSecret(p.Password)
			if err != nil {
				return nil, err
			}
		}
		hub.profiles[profile.ID] = profile
		if err = hub.save(); err != nil {
			if exists {
				hub.profiles[profile.ID] = old
			} else {
				delete(hub.profiles, profile.ID)
			}
			return nil, err
		}
		if c := hub.sessions[profile.ID]; c != nil && (!same || old.KeyFile != profile.KeyFile || p.Password != "") {
			c.Close()
			delete(hub.sessions, profile.ID)
		}
		profile.Secret = ""
		return profile, nil
	case "REMOTE_PROFILE_DELETE":
		if h.remoteBusy(p.ID) {
			return nil, fmt.Errorf("terminez ou arrêtez le transfert avant de supprimer la connexion")
		}
		hub.mu.Lock()
		defer hub.mu.Unlock()
		old, ok := hub.profiles[p.ID]
		if !ok {
			return nil, fmt.Errorf("connexion inconnue")
		}
		delete(hub.profiles, p.ID)
		if err := hub.save(); err != nil {
			hub.profiles[p.ID] = old
			return nil, err
		}
		if c := hub.sessions[p.ID]; c != nil {
			c.Close()
			delete(hub.sessions, p.ID)
		}
		return true, nil
	case "REMOTE_DISCONNECT":
		hub.mu.Lock()
		defer hub.mu.Unlock()
		if c := hub.sessions[p.ID]; c != nil {
			c.Close()
			delete(hub.sessions, p.ID)
		}
		return true, nil
	case "REMOTE_CONNECT":
		if len(p.Password) > 8192 || len(p.ConfirmFingerprint) > 200 {
			return nil, fmt.Errorf("identifiants distants invalides")
		}
		hub.mu.Lock()
		defer hub.mu.Unlock()
		profile, ok := hub.profiles[p.ID]
		if !ok {
			return nil, fmt.Errorf("connexion inconnue")
		}
		if profile.Protocol == "ftp" && !p.AllowPlainFTP {
			return nil, fmt.Errorf("confirmez explicitement la connexion FTP non chiffrée")
		}
		if existing := hub.sessions[p.ID]; existing != nil && !existing.closed.Load() {
			return M{"connected": true, "path": remoteLocation(profile.ID, profile.Root)}, nil
		}
		if h.remoteBusy(p.ID) {
			return nil, fmt.Errorf("attendez la fin de l’arrêt du transfert avant de reconnecter le serveur")
		}
		secret := p.Password
		if secret == "" {
			secret, err = unprotectRemoteSecret(profile.Secret)
			if err != nil {
				return nil, err
			}
		}
		c, fingerprint, err := dialRemote(profile, secret, p.ConfirmFingerprint, nil)
		if fingerprint != "" {
			return M{"needsTrust": true, "fingerprint": fingerprint}, nil
		}
		if err != nil {
			return nil, err
		}
		stop := c.timeout()
		initial, rootErr := c.stat(profile.Root)
		stop()
		if rootErr != nil || initial.Type != "directory" {
			c.Close()
			return nil, fmt.Errorf("dossier initial indisponible sur ce serveur")
		}
		if profile.Protocol == "sftp" {
			profile.Fingerprint = c.profile.Fingerprint
			hub.profiles[p.ID] = profile
			if err = hub.save(); err != nil {
				c.Close()
				return nil, err
			}
		}
		if old := hub.sessions[p.ID]; old != nil {
			old.Close()
		}
		hub.sessions[p.ID] = c
		return M{"connected": true, "path": remoteLocation(profile.ID, profile.Root)}, nil
	case "REMOTE_CHMOD", "REMOTE_DELETE":
		id, directory, err := parseRemoteLocation(p.Path)
		if err != nil {
			return nil, err
		}
		if directory == "/" {
			return nil, fmt.Errorf("la racine distante ne peut pas être modifiée")
		}
		c, err := hub.connection(id)
		if err != nil {
			return nil, err
		}
		c.mu.Lock()
		defer c.mu.Unlock()
		defer c.timeout()()
		actual, err := c.stat(directory)
		if err != nil {
			return nil, err
		}
		if p.Expected == nil || *p.Expected != actual {
			return nil, fmt.Errorf("élément distant modifié ; actualisez avant de continuer")
		}
		if r.Action == "REMOTE_CHMOD" {
			if c.sftp == nil || p.Mode > 0777 {
				return nil, fmt.Errorf("permissions réservées au SFTP, mode 000 à 777")
			}
			return true, c.sftp.Chmod(directory, os.FileMode(p.Mode))
		}
		if actual.Type == "directory" {
			if c.sftp != nil {
				return true, c.sftp.RemoveDirectory(directory)
			}
			return true, c.ftp.RemoveDir(directory)
		}
		if c.sftp != nil {
			return true, c.sftp.Remove(directory)
		}
		return true, c.ftp.Delete(directory)
	}
	return nil, fmt.Errorf("action distante inconnue")
}
func (h *Host) remoteFS(p Payload, action string) (any, error) {
	if action == "FS_TRANSFER" {
		return h.startRemoteJob(p)
	}
	if action == "FS_LIST_DIR" && p.Snapshot != "" {
		return h.paginatedListing(p, nil)
	}
	id, directory, err := parseRemoteLocation(p.Path)
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
		c.mu.Lock()
	} else if !c.mu.TryLock() {
		return nil, fmt.Errorf("serveur occupé ; réessayez après le transfert")
	}
	defer c.mu.Unlock()
	defer c.timeout()()
	switch action {
	case "FS_STAT":
		return c.stat(directory)
	case "FS_LIST_DIR":
		entries, err := c.list(directory)
		if err != nil {
			return nil, err
		}
		filtered := []Entry{}
		for _, entry := range entries {
			if strings.ContainsAny(entry.Name, "/\\\x00\r\n") || (!p.ShowHidden && strings.HasPrefix(entry.Name, ".")) || !strings.Contains(strings.ToLower(entry.Name), strings.ToLower(p.Filter)) {
				continue
			}
			filtered = append(filtered, entry)
		}
		sort.SliceStable(filtered, func(i, j int) bool {
			a, b := filtered[i], filtered[j]
			if !p.MixedSort && (a.Type == "directory") != (b.Type == "directory") {
				return a.Type == "directory"
			}
			order := strings.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name))
			if order == 0 {
				order = strings.Compare(a.Name, b.Name)
			}
			switch p.SortBy {
			case "size":
				if a.Size != b.Size {
					if a.Size < b.Size {
						order = -1
					} else {
						order = 1
					}
				}
			case "mtime":
				if a.Mtime != b.Mtime {
					if a.Mtime < b.Mtime {
						order = -1
					} else {
						order = 1
					}
				}
			case "type":
				if a.Ext != b.Ext {
					order = strings.Compare(a.Ext, b.Ext)
				}
			}
			if p.SortOrder == "desc" {
				return order > 0
			}
			return order < 0
		})
		parent := remoteLocation(id, path.Dir(directory))
		if directory == "/" {
			parent = ""
		}
		return h.paginatedListing(p, func() (M, error) {
			return M{"currentPath": p.Path, "parentPath": parent, "entries": filtered, "truncated": false}, nil
		})
	case "FS_READ":
		if p.Offset < 0 || p.Limit < 0 {
			return nil, fmt.Errorf("lecture distante invalide")
		}
		limit := p.Limit
		if limit < 1 || limit > 512*1024 {
			limit = 256 * 1024
		}
		actual, err := c.stat(directory)
		if err != nil {
			return nil, err
		}
		if actual.Type != "file" {
			return nil, fmt.Errorf("fichier distant régulier requis")
		}
		var reader io.ReadCloser
		if c.sftp != nil {
			f, openErr := c.sftp.Open(directory)
			if openErr != nil {
				return nil, openErr
			}
			_, err = f.Seek(int64(p.Offset), io.SeekStart)
			if err != nil {
				f.Close()
				return nil, err
			}
			reader = f
		} else {
			response, openErr := c.ftp.RetrFrom(directory, uint64(p.Offset))
			err = openErr
			if err != nil {
				return nil, err
			}
			_ = response.SetDeadline(time.Now().Add(30 * time.Second))
			reader = response
		}
		defer reader.Close()
		data, err := io.ReadAll(io.LimitReader(reader, int64(limit)))
		if err != nil {
			return nil, err
		}
		return M{"data": base64.StdEncoding.EncodeToString(data), "eof": int64(p.Offset+len(data)) >= actual.Size, "size": actual.Size}, nil
	case "FS_MKDIR":
		if err := validName(p.Name); err != nil {
			return nil, err
		}
		target := path.Join(directory, p.Name)
		if c.sftp != nil {
			err = c.sftp.Mkdir(target)
		} else {
			err = c.ftp.MakeDir(target)
		}
		if err != nil {
			return nil, err
		}
		return c.stat(target)
	case "FS_RENAME":
		actual, statErr := c.stat(directory)
		if statErr != nil {
			return nil, statErr
		}
		if p.Expected == nil || *p.Expected != actual {
			return nil, fmt.Errorf("élément distant modifié : actualisez avant de renommer")
		}
		if err := validName(p.Name); err != nil {
			return nil, err
		}
		if directory == "/" {
			return nil, fmt.Errorf("la racine ne peut pas être renommée")
		}
		target := path.Join(path.Dir(directory), p.Name)
		if _, err := c.stat(target); err == nil {
			return nil, fmt.Errorf("le nom de destination existe déjà")
		} else if !os.IsNotExist(err) {
			return nil, err
		}
		if c.sftp == nil {
			return nil, fmt.Errorf("renommage sécurisé disponible en SFTP")
		}
		err = c.sftp.Rename(directory, target)
		if err != nil {
			return nil, err
		}
		return c.stat(target)
	}
	return nil, fmt.Errorf("cet outil local ne s’applique pas à un dossier distant")
}
