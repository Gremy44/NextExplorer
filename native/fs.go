package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
)

var releaseVersion = "development"

type Entry struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	Type  string `json:"type"`
	Size  int64  `json:"size"`
	Mtime int64  `json:"mtime"`
	Ext   string `json:"ext"`
	Stamp string `json:"stamp,omitempty"`
}

func validPath(p string) (string, error) {
	if p == "" || strings.ContainsRune(p, 0) || !filepath.IsAbs(p) {
		return "", fmt.Errorf("chemin absolu requis")
	}
	p = filepath.Clean(p)
	if runtime.GOOS == "windows" && (strings.HasPrefix(p, `\\?\`) || strings.HasPrefix(p, `\\.\`) || strings.Contains(p[2:], ":")) {
		return "", fmt.Errorf("chemin de périphérique ou flux alternatif refusé")
	}
	return p, nil
}
func validName(s string) error {
	if s == "" || s == "." || s == ".." || strings.ContainsAny(s, "/\\\x00<>:\"|?*") || strings.TrimRight(s, " .") != s {
		return fmt.Errorf("nom de fichier invalide")
	}
	upper := strings.ToUpper(strings.Split(s, ".")[0])
	if regexp.MustCompile(`^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$`).MatchString(upper) {
		return fmt.Errorf("nom réservé")
	}
	return nil
}
func statEntry(p string) (Entry, error) {
	a, e := validPath(p)
	if e != nil {
		return Entry{}, e
	}
	s, e := os.Lstat(a)
	if e != nil {
		return Entry{}, e
	}
	kind := "file"
	if s.IsDir() {
		kind = "directory"
	}
	if s.Mode()&os.ModeSymlink != 0 {
		kind = "symlink"
	}
	return Entry{s.Name(), a, kind, s.Size(), s.ModTime().Unix(), strings.ToLower(filepath.Ext(a)), fmt.Sprint(s.ModTime().UnixNano())}, nil
}
func listDir(p Payload) (any, error) {
	dir, e := validPath(p.Path)
	if e != nil {
		return nil, e
	}
	folder, e := os.Open(dir)
	if e != nil {
		return nil, e
	}
	defer folder.Close()
	entries := []Entry{}
	entryLimit, metadataLimit := 10000, 8*1024*1024
	if p.Mode == "search" {
		entryLimit, metadataLimit = 50000, 32*1024*1024
	}
	truncated := false
	bytes, scanned, skipped := 0, 0, 0
listing:
	for {
		rows, readErr := folder.ReadDir(256)
		if readErr != nil && readErr != io.EOF {
			return nil, readErr
		}
		for _, d := range rows {
			scanned++
			if scanned > 200000 || len(entries) >= entryLimit || bytes >= metadataLimit {
				truncated = true
				break listing
			}
			if !p.ShowHidden && hidden(filepath.Join(dir, d.Name()), d.Name()) {
				continue
			}
			if p.Filter != "" && !strings.Contains(strings.ToLower(d.Name()), strings.ToLower(p.Filter)) {
				continue
			}
			v, e := statEntry(filepath.Join(dir, d.Name()))
			if e == nil {
				weight := len(v.Path) + len(v.Name) + 160
				if bytes+weight > metadataLimit {
					truncated = true
					break listing
				}
				entries = append(entries, v)
				bytes += weight
			} else {
				skipped++
			}
		}
		if readErr == io.EOF {
			break
		}
	}
	sort.SliceStable(entries, func(i, j int) bool {
		a, b := entries[i], entries[j]
		if !p.MixedSort && (a.Type == "directory") != (b.Type == "directory") {
			return a.Type == "directory"
		}
		cmp := strings.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name))
		if p.SortBy == "type" {
			cmp = strings.Compare(a.Ext, b.Ext)
		}
		if p.SortBy == "size" {
			if a.Size < b.Size {
				cmp = -1
			} else if a.Size > b.Size {
				cmp = 1
			}
		}
		if p.SortBy == "mtime" {
			if a.Mtime < b.Mtime {
				cmp = -1
			} else if a.Mtime > b.Mtime {
				cmp = 1
			}
		}
		if p.SortOrder == "desc" {
			return cmp > 0
		}
		return cmp < 0
	})
	total := len(entries)
	offset := max(0, min(p.Offset, total))
	limit := p.Limit
	if limit <= 0 || limit > 500 {
		limit = 500
	}
	if p.Limit == -1 {
		limit = total
	}
	end := min(offset+limit, total)
	var parent any = filepath.Dir(dir)
	if parent == dir {
		parent = nil
	}
	return M{"currentPath": dir, "parentPath": parent, "entries": entries[offset:end], "total": total, "nextOffset": end, "truncated": truncated, "skipped": skipped}, nil
}
func hello() M {
	home, _ := os.UserHomeDir()
	roots := []M{}
	if runtime.GOOS == "windows" {
		for c := 'A'; c <= 'Z'; c++ {
			p := fmt.Sprintf("%c:\\", c)
			if _, e := os.Stat(p); e == nil {
				roots = append(roots, M{"name": fmt.Sprintf("Disque %c:", c), "path": p})
			}
		}
	} else {
		roots = append(roots, M{"name": "Système", "path": "/"})
		for _, base := range []string{"/Volumes", "/media", "/mnt"} {
			ds, _ := os.ReadDir(base)
			for _, d := range ds {
				if d.IsDir() {
					roots = append(roots, M{"name": d.Name(), "path": filepath.Join(base, d.Name())})
				}
			}
		}
	}
	return M{"version": releaseVersion, "protocolVersion": protocolVersion, "platform": runtime.GOOS, "home": home, "roots": roots, "aliases": homeAliases(home), "tools": toolCapabilities(), "features": M{"imageSamples": true, "mediaStream": true, "checkedHash": true, "nativeDrag": runtime.GOOS == "windows", "nativeDragVersion": 2, "transferMerge": true, "operationJournal": true, "transferUndo": true, "zipExtract": runtime.GOOS == "windows", "archiveExtract": runtime.GOOS == "windows", "extractMerge": runtime.GOOS == "windows"}}
}
func readChunk(p Payload) (any, error) {
	a, e := validPath(p.Path)
	if e != nil {
		return nil, e
	}
	f, e := os.Open(a)
	if e != nil {
		return nil, e
	}
	defer f.Close()
	s, e := f.Stat()
	if e != nil {
		return nil, e
	}
	if !s.Mode().IsRegular() {
		return nil, fmt.Errorf("fichier ordinaire requis")
	}
	n := p.Limit
	if n <= 0 || n > 384*1024 {
		n = 384 * 1024
	}
	b := make([]byte, n)
	offset := max(0, p.Offset)
	nr, e := f.ReadAt(b, int64(offset))
	if e != nil && e != io.EOF {
		return nil, e
	}
	return M{"data": base64.StdEncoding.EncodeToString(b[:nr]), "size": s.Size(), "offset": offset, "nextOffset": offset + nr, "eof": int64(offset+nr) >= s.Size()}, nil
}
func writeFile(p Payload) (any, error) {
	dir, e := validPath(p.Path)
	if e != nil {
		return nil, e
	}
	if e = validName(p.Name); e != nil {
		return nil, e
	}
	a := filepath.Join(dir, p.Name)
	b := []byte(p.Text)
	if p.Data != "" {
		b, e = base64.StdEncoding.DecodeString(p.Data)
		if e != nil {
			return nil, e
		}
	}
	f, e := os.OpenFile(a, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if e != nil {
		return nil, e
	}
	_, e = f.Write(b)
	ce := f.Close()
	if e == nil {
		e = ce
	}
	return M{"path": a}, e
}
func renameOne(p Payload) (any, error) {
	a, e := validPath(p.Path)
	if e != nil {
		return nil, e
	}
	if e = validName(p.Name); e != nil {
		return nil, e
	}
	dest := filepath.Join(filepath.Dir(a), p.Name)
	if dest == a {
		return true, nil
	}
	if _, e = os.Lstat(dest); !os.IsNotExist(e) {
		return nil, fmt.Errorf("le nom existe déjà")
	}
	return true, os.Rename(a, dest)
}

type TrashRecord struct {
	Original string `json:"original"`
	Stored   string `json:"stored"`
}

func trashFiles(paths []string) (result any, failure error) {
	return trashFilesRecorded(paths, func(_, _, _ string, mutate func() error) error { return mutate() })
}

func trashFilesRecorded(paths []string, recordMutation func(string, string, string, func() error) error) (result any, failure error) {
	results := []M{}
	defer func() {
		if failure != nil {
			for i := len(results) - 1; i >= 0; i-- {
				if _, e := restoreTrash(results[i]["record"].(string)); e != nil {
					failure = fmt.Errorf("%v ; restauration manuelle nécessaire : %s (%v)", failure, results[i]["record"], e)
				}
			}
		}
	}()
	for _, p := range paths {
		a, e := validPath(p)
		if e != nil {
			return results, e
		}
		if filepath.Dir(a) == a {
			return results, fmt.Errorf("une racine ne peut pas être supprimée")
		}
		dir := filepath.Join(filepath.Dir(a), ".nextexplorer-trash")
		if strings.Contains(a, string(filepath.Separator)+".nextexplorer-trash") {
			return results, fmt.Errorf("utiliser la restauration")
		}
		if s, e := os.Lstat(dir); e == nil && s.Mode()&os.ModeSymlink != 0 {
			return results, fmt.Errorf("corbeille liée refusée")
		}
		if e = os.MkdirAll(dir, 0700); e != nil {
			return results, e
		}
		id := randomID()
		stored := filepath.Join(dir, id+"-"+filepath.Base(a))
		record := filepath.Join(dir, id+".json")
		b, _ := json.Marshal(TrashRecord{a, stored})
		if e = os.WriteFile(record, b, 0600); e != nil {
			return results, e
		}
		if e = recordMutation(a, stored, record, func() error { return os.Rename(a, stored) }); e != nil {
			// A journal result may fail after the rename succeeded. Keep the
			// recovery record whenever the stored file exists.
			if _, statErr := os.Lstat(stored); os.IsNotExist(statErr) {
				os.Remove(record)
			}
			return results, e
		}
		results = append(results, M{"path": a, "record": record})
	}
	return results, nil
}
func restoreTrash(record string) (any, error) {
	a, e := validPath(record)
	if e != nil {
		return nil, e
	}
	if filepath.Base(filepath.Dir(a)) != ".nextexplorer-trash" {
		return nil, fmt.Errorf("registre de corbeille invalide")
	}
	b, e := os.ReadFile(a)
	if e != nil {
		return nil, e
	}
	var r TrashRecord
	if e = json.Unmarshal(b, &r); e != nil {
		return nil, e
	}
	if filepath.Dir(r.Stored) != filepath.Dir(a) || filepath.Dir(r.Original) != filepath.Dir(filepath.Dir(a)) {
		return nil, fmt.Errorf("restauration hors périmètre")
	}
	if _, e = os.Lstat(r.Original); !os.IsNotExist(e) {
		return nil, fmt.Errorf("la destination existe déjà")
	}
	if e = os.Rename(r.Stored, r.Original); e != nil {
		return nil, e
	}
	return true, os.Remove(a)
}
func batchRename(p Payload) (any, error) {
	var re *regexp.Regexp
	var e error
	if p.Pattern != "" {
		re, e = regexp.Compile(p.Pattern)
		if e != nil {
			return nil, e
		}
	}
	rows := []M{}
	seen := map[string]bool{}
	valid := true
	for i, path := range p.Paths {
		a, e := validPath(path)
		if e != nil {
			return nil, e
		}
		ext := filepath.Ext(a)
		name := strings.TrimSuffix(filepath.Base(a), ext)
		if re != nil {
			name = re.ReplaceAllString(name, p.Replacement)
		}
		switch p.Case {
		case "lowercase":
			name = strings.ToLower(name)
		case "UPPERCASE":
			name = strings.ToUpper(name)
		case "snake_case", "kebab-case", "camelCase":
			words := regexp.MustCompile(`[\s_\-]+`).Split(name, -1)
			for j, w := range words {
				words[j] = strings.ToLower(w)
				if p.Case == "camelCase" && j > 0 && len(w) > 0 {
					words[j] = strings.ToUpper(w[:1]) + strings.ToLower(w[1:])
				}
			}
			sep := ""
			if p.Case == "snake_case" {
				sep = "_"
			}
			if p.Case == "kebab-case" {
				sep = "-"
			}
			name = strings.Join(words, sep)
		}
		prefix, suffix := p.Prefix, p.Suffix
		if strings.Contains(prefix+suffix, "{") {
			tags, err := metadataTags(a)
			if err != nil {
				return nil, err
			}
			for k, v := range tags {
				safe := regexp.MustCompile(`[<>:"/\\|?*\x00-\x1f]`).ReplaceAllString(v, "-")
				prefix = strings.ReplaceAll(prefix, "{"+k+"}", safe)
				suffix = strings.ReplaceAll(suffix, "{"+k+"}", safe)
			}
		}
		if p.Number {
			name += fmt.Sprintf("%0*d", max(1, min(p.Digits, 9)), p.Start+i*max(1, p.Step))
		}
		name = prefix + name + suffix + ext
		dest := filepath.Join(filepath.Dir(a), name)
		reason := ""
		if e = validName(name); e != nil {
			reason = e.Error()
		}
		key := dest
		if runtime.GOOS == "windows" {
			key = strings.ToLower(key)
		}
		if seen[key] {
			reason = "collision dans la sélection"
		}
		seen[key] = true
		if dest != a {
			if _, e = os.Lstat(dest); !os.IsNotExist(e) {
				reason = "destination existante"
			}
		}
		if _, e = os.Lstat(a); e != nil {
			reason = e.Error()
		}
		if reason != "" {
			valid = false
		}
		rows = append(rows, M{"from": a, "to": dest, "name": name, "error": reason})
	}
	if p.Apply {
		if !valid {
			return nil, fmt.Errorf("renommage refusé : collisions ou noms invalides")
		}
		done := []M{}
		for _, row := range rows {
			a, b := row["from"].(string), row["to"].(string)
			if a == b {
				continue
			}
			if e = os.Rename(a, b); e != nil {
				for i := len(done) - 1; i >= 0; i-- {
					os.Rename(done[i]["to"].(string), done[i]["from"].(string))
				}
				return nil, e
			}
			done = append(done, row)
		}
	}
	return M{"rows": rows, "valid": valid, "applied": p.Apply}, nil
}
