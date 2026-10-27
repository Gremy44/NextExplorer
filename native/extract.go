package main

import (
	"archive/zip"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

const extractMaxBytes = uint64(1 << 30)
const extractMaxFile = uint64(256 << 20)

func zipRelative(name string) (string, error) {
	if strings.Contains(name, "\\") || strings.HasPrefix(name, "/") {
		return "", fmt.Errorf("chemin ZIP interdit : %s", name)
	}
	name = strings.TrimSuffix(name, "/")
	parts := strings.Split(name, "/")
	for _, part := range parts {
		if err := validName(part); err != nil {
			return "", fmt.Errorf("chemin ZIP invalide : %s", name)
		}
	}
	return filepath.Join(parts...), nil
}

func (j *Job) extract(p Payload) (any, error) {
	// publishFile uses Windows MoveFile: directories cannot replace an existing target.
	if runtime.GOOS != "windows" {
		return nil, fmt.Errorf("extraction disponible sous Windows uniquement")
	}
	if len(p.Paths) != 1 {
		return nil, fmt.Errorf("sélectionnez une seule archive ZIP, 7z ou RAR")
	}
	if len(p.Members) > 0 { if err := validateMembers(p.Members); err != nil {
		return nil, err
	} }
	if p.Expected != nil {
		actual, err := statEntry(p.Paths[0])
		if err != nil || actual != *p.Expected {
			return nil, fmt.Errorf("Archive modifiée depuis son ouverture")
		}
	}
	ext := strings.ToLower(filepath.Ext(p.Paths[0]))
	if ext != ".zip" && ext != ".7z" && ext != ".rar" {
		return nil, fmt.Errorf("format d'archive non pris en charge")
	}
	if !p.Merge {
		if err := validName(p.Name); err != nil {
			return nil, err
		}
	}
	if p.Conflict != "rename" && p.Conflict != "skip" && !(p.Merge && p.Conflict == "overwrite") && !(!p.Merge && p.Conflict == "error") {
		return nil, fmt.Errorf("politique de conflit invalide")
	}
	dest, err := validPath(p.Destination)
	if err != nil {
		return nil, err
	}
	dest, err = filepath.EvalSymlinks(dest)
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(dest)
	if err != nil || !info.IsDir() {
		return nil, fmt.Errorf("dossier de destination requis")
	}
	target := filepath.Join(dest, p.Name)
	if p.Merge {
		target = dest
	} else {
		if _, err := os.Lstat(target); err == nil {
			switch p.Conflict {
			case "skip":
				return M{"destination": target, "skipped": true}, nil
			case "rename":
				target = uniquePath(target)
			default:
				return nil, fmt.Errorf("destination déjà présente")
			}
		} else if !os.IsNotExist(err) {
			return nil, err
		}
	}
	archive, err := validPath(p.Paths[0])
	if err != nil {
		return nil, err
	}
	if ext != ".zip" || p.Password != "" {
		converted, cleanup, err := j.convertArchivePassword(archive, dest, ext, p.Password)
		if err != nil {
			return nil, err
		}
		defer cleanup()
		archive = converted
		j.mu.Lock()
		j.Done = 0
		j.mu.Unlock()
	}
	reader, err := zip.OpenReader(archive)
	if err != nil {
		return nil, err
	}
	defer reader.Close()
	if len(reader.File) > 3000 {
		return nil, fmt.Errorf("extraction limitée à 3 000 entrées")
	}
	names := map[string]bool{}
	types := map[string]bool{}
	var total uint64
	for _, f := range reader.File {
		if f.Flags&1 != 0 {
			return nil, fmt.Errorf("ZIP chiffré non pris en charge")
		}
		if err := j.check(); err != nil {
			return nil, err
		}
		rel, err := zipRelative(f.Name)
		if err != nil {
			return nil, err
		}
		if f.Mode()&os.ModeSymlink != 0 || (!f.Mode().IsRegular() && !f.FileInfo().IsDir()) {
			return nil, fmt.Errorf("lien ou fichier spécial ZIP refusé")
		}
		key := strings.ToLower(rel)
		if names[key] {
			return nil, fmt.Errorf("entrée ZIP dupliquée : %s", f.Name)
		}
		names[key] = true
		isDir := f.FileInfo().IsDir()
		if old, ok := types[key]; ok && old != isDir {
			return nil, fmt.Errorf("collision fichier/dossier ZIP")
		}
		types[key] = isDir
		for parent := filepath.Dir(rel); parent != "."; parent = filepath.Dir(parent) {
			k := strings.ToLower(parent)
			if d, ok := types[k]; ok && !d {
				return nil, fmt.Errorf("collision fichier/dossier ZIP")
			}
			types[k] = true
		}
		if f.UncompressedSize64 > extractMaxFile || f.UncompressedSize64 > extractMaxBytes-total {
			return nil, fmt.Errorf("ZIP limité à 256 Mio par entrée et 1 Gio au total")
		}
		total += f.UncompressedSize64
	}
	if len(p.Members) > 0 {
		selected := []*zip.File{}
		inventory := make([]engineEntry, 0, len(reader.File))
		for _, f := range reader.File { inventory = append(inventory, engineEntry{f.Name, f.UncompressedSize64, f.FileInfo().IsDir()}) }
		if _, err := selectArchiveEntries(inventory, p.Members); err != nil { return nil, err }
		total = 0
		for _, f := range reader.File {
			if memberSelected(f.Name, p.Members) {
				selected = append(selected, f)
				total += f.UncompressedSize64
			}
		}
		if len(selected) == 0 {
			return nil, fmt.Errorf("Aucune entrée sélectionnée dans l’archive")
		}
		reader.File = selected
	}
	j.mu.Lock()
	j.Total = int64(total)
	j.mu.Unlock()
	staging, err := os.MkdirTemp(dest, ".nextexplorer-extract-")
	if err != nil {
		return nil, err
	}
	if !filepath.IsAbs(staging) || staging == dest || !isWithin(staging, dest) {
		return nil, fmt.Errorf("dossier temporaire hors destination")
	}
	// The temporary directory is created under the canonical destination above.
	defer os.RemoveAll(staging)
	root, err := os.OpenRoot(staging)
	if err != nil {
		return nil, err
	}
	defer root.Close()
	for _, f := range reader.File {
		if err := j.check(); err != nil {
			return nil, err
		}
		rel, _ := zipRelative(f.Name)
		folder := filepath.Dir(rel)
		if f.FileInfo().IsDir() {
			folder = rel
		}
		if folder != "." {
			current := ""
			for _, part := range strings.Split(folder, string(filepath.Separator)) {
				current = filepath.Join(current, part)
				if err := root.Mkdir(current, 0700); err != nil && !os.IsExist(err) {
					return nil, err
				}
			}
		}
		if f.FileInfo().IsDir() {
			continue
		}
		if err := j.extractFile(root, rel, f); err != nil {
			return nil, err
		}
	}
	if err := j.check(); err != nil {
		return nil, err
	}
	if err := root.Close(); err != nil {
		return nil, err
	}
	if p.Merge {
		// Validate all nested conflicts before applying any member to the destination.
		rows, err := os.ReadDir(staging)
		if err != nil {
			return nil, err
		}
		merge := Payload{Mode: "copy", Conflict: p.Conflict, Merge: true}
		if p.Conflict == "overwrite" {
			original, err := filepath.EvalSymlinks(p.Paths[0])
			if err != nil {
				return nil, err
			}
			originalInfo, err := os.Stat(original)
			if err != nil {
				return nil, err
			}
			for _, member := range reader.File {
				rel, _ := zipRelative(member.Name)
				memberTarget := filepath.Join(dest, rel)
				existing, statErr := os.Lstat(memberTarget)
				if statErr != nil && !os.IsNotExist(statErr) {
					return nil, statErr
				}
				if strings.EqualFold(memberTarget, original) || (statErr == nil && os.SameFile(existing, originalInfo)) {
					return nil, fmt.Errorf("l'archive source ne peut pas être remplacée par son contenu")
				}
			}
		}
		for _, row := range rows {
			if _, err := j.transferEntry(filepath.Join(staging, row.Name()), filepath.Join(dest, row.Name()), merge, true); err != nil {
				return nil, err
			}
		}
		j.mu.Lock()
		j.Total = int64(total * 2)
		j.archiveRoot = staging
		j.archiveSource = p.Paths[0]
		j.mu.Unlock()
		for _, row := range rows {
			if _, err := j.transferEntry(filepath.Join(staging, row.Name()), filepath.Join(dest, row.Name()), merge, false); err != nil {
				return nil, err
			}
		}
		return M{"destination": dest, "entries": len(reader.File), "bytes": total, "skipped": false, "merged": true, "audit": j.snapshot()["audit"]}, nil
	}
	if err := publishFile(staging, target); err != nil {
		return nil, fmt.Errorf("publication refusée (destination modifiée ou inaccessible) : %w", err)
	}
	return M{"destination": target, "entries": len(reader.File), "bytes": total, "skipped": false}, nil
}

func (j *Job) extractFile(root *os.Root, name string, f *zip.File) error {
	input, err := f.Open()
	if err != nil {
		return err
	}
	defer input.Close()
	output, err := root.OpenFile(name, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	defer output.Close()
	buf := make([]byte, 128*1024)
	var written uint64
	for {
		if err := j.check(); err != nil {
			return err
		}
		n, readErr := input.Read(buf)
		if uint64(n) > f.UncompressedSize64-written {
			return fmt.Errorf("taille ZIP incohérente")
		}
		if n > 0 {
			if _, err := output.Write(buf[:n]); err != nil {
				return err
			}
			written += uint64(n)
			j.progress(int64(n))
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return readErr
		}
	}
	if written != f.UncompressedSize64 {
		return fmt.Errorf("taille ZIP incohérente")
	}
	if err := output.Sync(); err != nil {
		return err
	}
	return output.Close()
}
