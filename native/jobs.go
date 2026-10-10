package main

import (
	"context"
	"crypto/md5"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"hash"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"lukechampine.com/blake3"
)

type Job struct {
	mu                         sync.Mutex
	ID, Kind, State, Error     string
	Done, Total                int64
	Result                     any
	started                    time.Time
	ctx                        context.Context
	cancel                     context.CancelFunc
	host                       *Host
	last                       time.Time
	Audit                      TransferAudit
	JournalError               string
	archiveRoot, archiveSource string
	transactionStep            int
}

func (j *Job) snapshot() M {
	j.mu.Lock()
	defer j.mu.Unlock()
	speed := float64(j.Done) / max(0.01, time.Since(j.started).Seconds())
	eta := float64(j.Total-j.Done) / max(1, speed)
	audit := j.Audit
	audit.Entries = append([]TransferEntry{}, audit.Entries...)
	return M{"id": j.ID, "kind": j.Kind, "state": j.State, "done": j.Done, "total": j.Total, "speed": speed, "eta": eta, "error": j.Error, "result": j.Result, "audit": audit, "startedAt": j.started.UTC().Format(time.RFC3339), "journalError": j.JournalError}
}
func (j *Job) emit() {
	snapshot := j.snapshot()
	delete(snapshot, "result")
	j.host.send(M{"event": "JOB_UPDATE", "data": snapshot})
}
func (j *Job) control(c string) {
	j.mu.Lock()
	switch c {
	case "cancel":
		j.cancel()
	case "pause":
		if j.Kind == "transfer" && j.State == "running" {
			j.State = "paused"
		}
	case "resume":
		if j.State == "paused" {
			j.State = "running"
		}
	}
	j.mu.Unlock()
	j.emit()
}
func (j *Job) check() error {
	for {
		if e := j.ctx.Err(); e != nil {
			return e
		}
		j.mu.Lock()
		pause := j.State == "paused"
		j.mu.Unlock()
		if !pause {
			return nil
		}
		time.Sleep(75 * time.Millisecond)
	}
}
func (j *Job) progress(n int64) {
	j.mu.Lock()
	j.Done += n
	emit := time.Since(j.last) > 150*time.Millisecond
	if emit {
		j.last = time.Now()
	}
	j.mu.Unlock()
	if emit {
		j.emit()
	}
}
func (h *Host) startJob(kind string, p Payload) M {
	ctx, cancel := context.WithCancel(context.Background())
	j := &Job{ID: "job-" + randomID(), Kind: kind, State: "queued", started: time.Now(), ctx: ctx, cancel: cancel, host: h}
	h.mu.Lock()
	h.jobs[j.ID] = j
	h.mu.Unlock()
	j.saveJournal()
	go func() {
		h.mutateMu.Lock()
		defer h.mutateMu.Unlock()
		j.mu.Lock()
		j.State = "running"
		j.started = time.Now()
		j.mu.Unlock()
		j.emit()
		var r any
		var e error
		if e = j.check(); e == nil {
			switch kind {
			case "transfer":
				r, e = j.transfer(p)
			case "scan":
				r, e = j.scan(p.Path, false)
			case "duplicates":
				r, e = j.scan(p.Path, true)
			case "convert":
				r, e = j.convert(p)
			case "zip":
				r, e = j.zip(p)
			case "extract":
				r, e = j.extract(p)
			case "metadata":
				r, e = j.editMetadata(p)
			case "download":
				r, e = j.download(p)
			}
		}
		j.mu.Lock()
		j.Result = r
		if e != nil {
			j.State = "error"
			j.Error = e.Error()
			if ctx.Err() != nil {
				j.State = "cancelled"
			}
		} else {
			j.State = "completed"
		}
		j.mu.Unlock()
		cancel()
		j.saveJournal()
		j.emit()
	}()
	return M{"jobId": j.ID}
}
func hashFile(path, algorithm string) (string, error) {
	a, e := validPath(path)
	if e != nil {
		return "", e
	}
	f, e := os.Open(a)
	if e != nil {
		return "", e
	}
	defer f.Close()
	var h hash.Hash
	switch algorithm {
	case "md5":
		h = md5.New()
	case "sha256":
		h = sha256.New()
	case "blake3", "":
		h = blake3.New(32, nil)
	default:
		return "", fmt.Errorf("algorithme inconnu")
	}
	if _, e = io.Copy(h, f); e != nil {
		return "", e
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
func isWithin(child, parent string) bool {
	rel, e := filepath.Rel(parent, child)
	return e == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}
func uniquePath(path string) string {
	ext := filepath.Ext(path)
	stem := strings.TrimSuffix(path, ext)
	for i := 1; ; i++ {
		p := fmt.Sprintf("%s (%d)%s", stem, i, ext)
		if _, e := os.Lstat(p); os.IsNotExist(e) {
			return p
		}
	}
}
func (j *Job) transfer(p Payload) (result any, failure error) {
	finish, err := j.beginTransaction(p)
	if err != nil {
		return nil, err
	}
	defer func() { failure = finish(failure) }()
	dest, e := validPath(p.Destination)
	if e != nil {
		return nil, e
	}
	dest, e = filepath.EvalSymlinks(dest)
	if e != nil {
		return nil, e
	}
	if s, e := os.Stat(dest); e != nil || !s.IsDir() {
		return nil, fmt.Errorf("dossier de destination requis")
	}
	if p.Mode != "copy" && p.Mode != "move" {
		return nil, fmt.Errorf("mode de transfert invalide")
	}
	if p.Conflict != "rename" && p.Conflict != "skip" && p.Conflict != "overwrite" {
		return nil, fmt.Errorf("politique de conflit requise")
	}
	sources := []string{}
	for _, s := range p.Paths {
		a, e := validPath(s)
		if e != nil {
			return nil, e
		}
		if info, err := os.Lstat(a); err != nil {
			return nil, err
		} else if info.Mode()&os.ModeSymlink != 0 {
			return nil, fmt.Errorf("transfert de lien symbolique refusé")
		}
		a, e = filepath.EvalSymlinks(a)
		if e != nil {
			return nil, e
		}
		if filepath.Dir(a) == a {
			return nil, fmt.Errorf("transfert d'une racine refusé")
		}
		if isWithin(dest, a) {
			return nil, fmt.Errorf("destination à l'intérieur de la source")
		}
		sources = append(sources, a)
	}
	// Reject predictable batch conflicts before moving any source.
	for i, a := range sources {
		for _, b := range sources[:i] {
			if isWithin(a, b) || isWithin(b, a) {
				return nil, fmt.Errorf("sources identiques ou imbriquées : sélectionnez chaque élément une seule fois")
			}
			if p.Conflict == "overwrite" && strings.EqualFold(filepath.Base(a), filepath.Base(b)) {
				return nil, fmt.Errorf("plusieurs sources portent le même nom : choisir conserver les deux")
			}
		}
		target := filepath.Join(dest, filepath.Base(a))
		src, err := os.Stat(a)
		if err != nil {
			return nil, err
		}
		existing, err := os.Lstat(target)
		if err != nil && !os.IsNotExist(err) {
			return nil, err
		}
		if err == nil {
			if os.SameFile(src, existing) {
				return nil, fmt.Errorf("source et destination identiques")
			}
			if p.Conflict == "overwrite" && !(p.Merge && src.IsDir() && existing.IsDir()) && (!src.Mode().IsRegular() || !existing.Mode().IsRegular()) {
				return nil, fmt.Errorf("remplacement réservé aux fichiers ordinaires : choisir conserver les deux ou ignorer")
			}
		}
	}
	for _, a := range sources {
		e = filepath.WalkDir(a, func(path string, d os.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if e := j.check(); e != nil {
				return e
			}
			if d.Type()&os.ModeSymlink != 0 {
				return fmt.Errorf("lien symbolique ignoré par sécurité : %s", path)
			}
			if !d.IsDir() {
				s, e := d.Info()
				if e != nil {
					return e
				}
				j.mu.Lock()
				j.Total += s.Size()
				j.mu.Unlock()
			}
			return nil
		})
		if e != nil {
			return nil, e
		}
	}
	completed := []string{}
	for _, a := range sources {
		if _, e = j.transferEntry(a, filepath.Join(dest, filepath.Base(a)), p, true); e != nil {
			return nil, e
		}
	}
	for _, a := range sources {
		target, err := j.transferEntry(a, filepath.Join(dest, filepath.Base(a)), p, false)
		e = err
		if e != nil {
			return completed, e
		}
		if target != "" {
			completed = append(completed, target)
		}
	}
	return completed, nil
}

// dryRun validates existing nested collisions without changing either tree.
func (j *Job) transferEntry(src, dst string, p Payload, dryRun bool) (string, error) {
	if err := j.check(); err != nil {
		return "", err
	}
	s, err := os.Lstat(src)
	if err != nil {
		return "", err
	}
	if s.Mode()&os.ModeSymlink != 0 {
		return "", fmt.Errorf("lien source refusé : %s", src)
	}
	d, err := os.Lstat(dst)
	if err != nil && !os.IsNotExist(err) {
		return "", err
	}
	if d != nil {
		if os.SameFile(s, d) {
			return "", fmt.Errorf("source et destination identiques")
		}
		if p.Merge && s.IsDir() && d.IsDir() {
			rows, err := os.ReadDir(src)
			if err != nil {
				return "", err
			}
			for _, row := range rows {
				if _, err := j.transferEntry(filepath.Join(src, row.Name()), filepath.Join(dst, row.Name()), p, dryRun); err != nil {
					return "", err
				}
			}
			if !dryRun && p.Mode == "move" {
				remaining, err := os.ReadDir(src)
				if err != nil {
					return "", err
				}
				// Skipped children must remain at their original location.
				if len(remaining) == 0 {
					if err := j.transaction("remove-directory", src, "", "", "", func() error { return os.Remove(src) }); err != nil {
						return "", err
					}
				}
			}
			return dst, nil
		}
		switch p.Conflict {
		case "skip":
			if !dryRun {
				j.recordTransfer(src, dst, "skipped")
			}
			return "", nil
		case "rename":
			if !dryRun {
				dst = uniquePath(dst)
			}
		case "overwrite":
			if !s.Mode().IsRegular() || !d.Mode().IsRegular() {
				return "", fmt.Errorf("conflit fichier/dossier ou lien : %s ; choisir conserver les deux ou ignorer", dst)
			}
		}
	}
	if dryRun {
		return dst, nil
	}
	return dst, j.copyTree(src, dst, p.Mode == "move", p.Conflict == "overwrite")
}
func (j *Job) copyTree(src, dst string, move, overwrite bool) error {
	if e := j.check(); e != nil {
		return e
	}
	s, e := os.Lstat(src)
	if e != nil {
		return e
	}
	if s.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("lien symbolique refusé")
	}
	if s.IsDir() {
		if e = j.transaction("create-directory", src, dst, "", "", func() error { return os.Mkdir(dst, s.Mode().Perm()) }); e != nil {
			return e
		}
		rows, e := os.ReadDir(src)
		if e != nil {
			return e
		}
		for _, d := range rows {
			if e = j.copyTree(filepath.Join(src, d.Name()), filepath.Join(dst, d.Name()), move, false); e != nil {
				return e
			}
		}
		if move {
			return j.transaction("remove-directory", src, "", "", "", func() error { return os.Remove(src) })
		}
		return nil
	}
	if !s.Mode().IsRegular() {
		return fmt.Errorf("fichier spécial refusé")
	}
	// An overwrite authorizes only the destination observed before this copy.
	expected, err := os.Lstat(dst)
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	if expected != nil && (!overwrite || !expected.Mode().IsRegular() || os.SameFile(s, expected)) {
		return fmt.Errorf("destination existante incompatible avec la copie")
	}
	in, e := os.Open(src)
	if e != nil {
		return e
	}
	defer in.Close()
	temp, e := os.CreateTemp(filepath.Dir(dst), ".nextexplorer-part-*")
	if e != nil {
		return e
	}
	tmp := temp.Name()
	defer os.Remove(tmp)
	defer temp.Close()
	hasher := blake3.New(32, nil)
	buf := make([]byte, 1024*1024)
	for {
		if e = j.check(); e != nil {
			return e
		}
		n, err := in.Read(buf)
		if n > 0 {
			if _, e = temp.Write(buf[:n]); e != nil {
				return e
			}
			hasher.Write(buf[:n])
			j.progress(int64(n))
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
	}
	if e = temp.Sync(); e != nil {
		return e
	}
	if e = temp.Close(); e != nil {
		return e
	}
	verified, e := hashFile(tmp, "blake3")
	if e != nil {
		return e
	}
	if verified != hex.EncodeToString(hasher.Sum(nil)) {
		return fmt.Errorf("échec de vérification BLAKE3")
	}
	now, e := in.Stat()
	if e != nil {
		return e
	}
	if now.Size() != s.Size() || !now.ModTime().Equal(s.ModTime()) {
		return fmt.Errorf("source modifiée pendant le transfert")
	}
	in.Close()
	if e = j.check(); e != nil {
		return e
	}
	current, statErr := os.Lstat(dst)
	if statErr != nil && !os.IsNotExist(statErr) {
		return statErr
	}
	if expected != nil && (statErr != nil || !os.SameFile(expected, current) || expected.Size() != current.Size() || !expected.ModTime().Equal(current.ModTime())) {
		return fmt.Errorf("destination modifiée pendant la copie : relancer après vérification")
	}
	if statErr == nil {
		if !overwrite || expected == nil {
			return fmt.Errorf("destination apparue pendant la copie")
		}
		oldHash, hashErr := hashFile(dst, "blake3")
		if hashErr != nil {
			return hashErr
		}
		if _, e = trashFilesRecorded([]string{dst}, func(original, stored, record string, mutate func() error) error {
			return j.transaction("trash-destination", original, stored, oldHash, record, mutate)
		}); e != nil {
			return e
		}
	}
	if e = j.transaction("publish-file", src, dst, verified, "", func() error { return publishFile(tmp, dst) }); e != nil {
		return e
	}
	os.Chmod(dst, s.Mode().Perm())
	os.Chtimes(dst, s.ModTime(), s.ModTime())
	if move {
		if e := j.transaction("remove-source", src, dst, verified, "", func() error { return os.Remove(src) }); e != nil {
			j.recordTransfer(src, dst, "source-retained")
			return e
		}
		j.recordTransfer(src, dst, "moved")
	} else {
		j.recordTransfer(src, dst, "copied")
	}
	return nil
}
func (j *Job) scan(path string, duplicates bool) (any, error) {
	root, e := validPath(path)
	if e != nil {
		return nil, e
	}
	type item struct {
		Path string `json:"path"`
		Size int64  `json:"size"`
	}
	items := []item{}
	groups := map[int64][]string{}
	skipped := 0
	total := int64(0)
	e = filepath.WalkDir(root, func(p string, d os.DirEntry, err error) error {
		if e := j.check(); e != nil {
			return e
		}
		if err != nil {
			skipped++
			return nil
		}
		if d.IsDir() {
			if d.Name() == ".nextexplorer-trash" {
				return filepath.SkipDir
			}
			return nil
		}
		if d.Type()&os.ModeSymlink != 0 {
			return nil
		}
		s, err := d.Info()
		if err != nil {
			skipped++
			return nil
		}
		total += s.Size()
		groups[s.Size()] = append(groups[s.Size()], p)
		rel, _ := filepath.Rel(root, p)
		top := strings.Split(rel, string(filepath.Separator))[0]
		found := false
		for i := range items {
			if items[i].Path == filepath.Join(root, top) {
				items[i].Size += s.Size()
				found = true
				break
			}
		}
		if !found {
			items = append(items, item{filepath.Join(root, top), s.Size()})
		}
		j.progress(1)
		return nil
	})
	if e != nil {
		return nil, e
	}
	if !duplicates {
		sort.Slice(items, func(i, k int) bool { return items[i].Size > items[k].Size })
		truncated := len(items) > 500
		if truncated {
			items = items[:500]
		}
		return M{"items": items, "total": total, "skipped": skipped, "truncated": truncated}, nil
	}
	byHash := map[string][]string{}
	tasks := make(chan string)
	var workers sync.WaitGroup
	var resultMu sync.Mutex
	for i := 0; i < min(8, runtime.NumCPU()); i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for p := range tasks {
				if j.check() != nil {
					continue
				}
				file, err := os.Open(p)
				if err != nil {
					resultMu.Lock()
					skipped++
					resultMu.Unlock()
					continue
				}
				hasher := blake3.New(32, nil)
				_, err = io.Copy(hasher, &checkedReader{j: j, r: file})
				file.Close()
				resultMu.Lock()
				if err != nil {
					skipped++
				} else {
					digest := hex.EncodeToString(hasher.Sum(nil))
					byHash[digest] = append(byHash[digest], p)
				}
				resultMu.Unlock()
			}
		}()
	}
	for size, paths := range groups {
		if len(paths) < 2 || size == 0 {
			continue
		}
		for _, p := range paths {
			tasks <- p
		}
	}
	close(tasks)
	workers.Wait()
	if e = j.check(); e != nil {
		return nil, e
	}
	result := []M{}
	for hash, paths := range byHash {
		if len(paths) > 1 {
			sort.Strings(paths)
			result = append(result, M{"hash": hash, "paths": paths})
		}
		if len(result) >= 300 {
			break
		}
	}
	return M{"groups": result, "skipped": skipped, "limit": 300}, nil
}
