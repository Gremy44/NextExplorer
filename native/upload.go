package main

import (
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

type Upload struct {
	file    *os.File
	offset  int
	created time.Time
}

func (h *Host) upload(p Payload) (any, error) {
	dir, e := validPath(p.Path)
	if e != nil {
		return nil, e
	}
	if e = validName(p.Name); e != nil {
		return nil, e
	}
	target := filepath.Join(dir, p.Name)
	for key, u := range h.uploads {
		if time.Since(u.created) > 30*time.Minute {
			u.file.Close()
			os.Remove(u.file.Name())
			delete(h.uploads, key)
		}
	}
	if _, err := os.Lstat(target); !os.IsNotExist(err) {
		return nil, fmt.Errorf("fichier existant")
	}
	u := h.uploads[target]
	if p.Offset == 0 {
		if u != nil {
			return nil, fmt.Errorf("import déjà en cours")
		}
		f, err := os.CreateTemp(dir, ".nextexplorer-upload-*")
		if err != nil {
			return nil, err
		}
		u = &Upload{file: f, created: time.Now()}
		h.uploads[target] = u
	}
	if u == nil || u.offset != p.Offset {
		return nil, fmt.Errorf("ordre des blocs invalide")
	}
	data, e := base64.StdEncoding.DecodeString(p.Data)
	if e != nil {
		return nil, e
	}
	n, e := u.file.Write(data)
	u.offset += n
	if e != nil {
		return nil, e
	}
	if p.Final {
		if e = u.file.Sync(); e != nil {
			return nil, e
		}
		if e = u.file.Close(); e != nil {
			return nil, e
		}
		delete(h.uploads, target)
		if e = publishFile(u.file.Name(), target); e != nil {
			os.Remove(u.file.Name())
			return nil, e
		}
	}
	return M{"path": target, "offset": u.offset, "complete": p.Final}, nil
}
