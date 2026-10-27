package main

import (
	"archive/zip"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

func memberSelected(name string, members []string) bool {
	if len(members) == 0 {
		return true
	}
	for _, m := range members {
		m = strings.TrimSuffix(m, "/")
		if strings.TrimSuffix(name, "/") == m || strings.HasPrefix(name, m+"/") {
			return true
		}
	}
	return false
}
func validateMembers(members []string) error {
	if len(members) > 3000 {
		return fmt.Errorf("3 000 sélections maximum")
	}
	for _, m := range members {
		if _, err := zipRelative(m); err != nil {
			return err
		}
	}
	return nil
}
func selectArchiveEntries(entries []engineEntry, members []string) ([]engineEntry, error) {
	if err := validateMembers(members); err != nil { return nil, err }
	selected := make([]engineEntry, 0, len(entries))
	for _, entry := range entries { if memberSelected(entry.name, members) { selected = append(selected, entry) } }
	for _, member := range members {
		found := false
		for _, entry := range selected { if entry.name == member || strings.HasPrefix(entry.name, strings.TrimSuffix(member, "/")+"/") { found = true; break } }
		if !found { return nil, fmt.Errorf("Entrée sélectionnée introuvable : %s", member) }
	}
	if len(selected) == 0 { return nil, fmt.Errorf("Aucune entrée sélectionnée") }
	return selected, nil
}
func archiveInventory(path string) ([]engineEntry, error) {
	if strings.EqualFold(filepath.Ext(path), ".zip") {
		z, err := zip.OpenReader(path)
		if err != nil {
			return nil, err
		}
		defer z.Close()
		if len(z.File) > 3000 {
			return nil, fmt.Errorf("Archive limitée à 3 000 entrées")
		}
		result := []engineEntry{}
		seen := map[string]bool{}
		var total uint64
		for _, f := range z.File {
			rel, err := zipRelative(f.Name)
			if err != nil {
				return nil, err
			}
			key := strings.ToLower(rel)
			if seen[key] || f.Mode()&os.ModeSymlink != 0 || (!f.Mode().IsRegular() && !f.FileInfo().IsDir()) || f.Flags&1 != 0 {
				return nil, fmt.Errorf("Archive ambiguë, chiffrée ou contenant un lien : utilisez l’extraction sécurisée")
			}
			seen[key] = true
			if f.UncompressedSize64 > extractMaxFile || f.UncompressedSize64 > extractMaxBytes-total {
				return nil, fmt.Errorf("Limites de décompression dépassées")
			}
			total += f.UncompressedSize64
			result = append(result, engineEntry{f.Name, f.UncompressedSize64, f.FileInfo().IsDir()})
		}
		return result, nil
	}
	ext := strings.ToLower(filepath.Ext(path))
	if ext != ".7z" && ext != ".rar" {
		return nil, fmt.Errorf("Archive ZIP, 7z ou RAR requise")
	}
	engine, err := toolPath("7z")
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	banner, err := commandOutput(ctx, "7z", []string{"i"}, "")
	if err != nil || !supported7zip(banner) {
		return nil, fmt.Errorf("7-Zip 26.03 ou plus récent requis")
	}
	c := exec.CommandContext(ctx, engine, "l", "-slt", "-sccUTF-8", "-pNextExplorer-no-password", "--", path)
	quiet(c)
	out := &strictBuffer{limit: 1 << 20}
	c.Stdout = out
	var stderr limitedBuffer
	c.Stderr = &stderr
	if err = c.Run(); err != nil {
		return nil, fmt.Errorf("Inventaire impossible : archive chiffrée, endommagée ou moteur indisponible")
	}
	header, text, ok := strings.Cut(strings.ReplaceAll(out.String(), "\r\n", "\n"), "\n----------\n")
	if !ok || strings.Contains(header, "Multivolume = +") || strings.Contains(header, "Volume = +") || (strings.Contains(header, "Volumes = ") && !strings.Contains(header, "Volumes = 1")) {
		return nil, fmt.Errorf("Archive multivolume ou inventaire incomplet")
	}
	return parseEngineList(text)
}
func browseArchive(p Payload, read bool) (any, error) {
	entry, err := statEntry(p.Path)
	if err != nil {
		return nil, err
	}
	if p.Expected == nil || *p.Expected != entry || entry.Type != "file" || entry.Size > 128<<20 {
		return nil, fmt.Errorf("Archive inchangée de 128 Mio maximum requise")
	}
	entries, err := archiveInventory(entry.Path)
	if err != nil {
		return nil, err
	}
	if !read {
		rows := []M{}
		for _, e := range entries {
			rows = append(rows, M{"name": e.name, "size": e.size, "directory": e.directory})
		}
		after, e := statEntry(entry.Path)
		if e != nil || after != entry {
			return nil, fmt.Errorf("Archive modifiée pendant l’inventaire")
		}
		return M{"entries": rows, "expected": entry}, nil
	}
	var member *engineEntry
	for _, e := range entries {
		if e.name == p.Name {
			v := e
			member = &v
			break
		}
	}
	if member == nil || member.directory {
		return nil, fmt.Errorf("Entrée de fichier inconnue")
	}
	if member.size > 512<<10 {
		return nil, fmt.Errorf("Aperçu limité à 512 Kio ; extrayez ce fichier pour le consulter")
	}
	var data []byte
	if entry.Ext == ".zip" {
		z, e := zip.OpenReader(entry.Path)
		if e != nil {
			return nil, e
		}
		defer z.Close()
		for _, f := range z.File {
			if f.Name == p.Name {
				r, e := f.Open()
				if e != nil {
					return nil, e
				}
				data, err = io.ReadAll(io.LimitReader(r, (512<<10)+1))
				r.Close()
				break
			}
		}
	} else {
		engine, e := toolPath("7z")
		if e != nil {
			return nil, e
		}
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		c := exec.CommandContext(ctx, engine, "x", "-so", "-spd", "-r-", "-y", "-bso0", "-bsp0", "-pNextExplorer-no-password", "--", entry.Path, p.Name)
		quiet(c)
		out := &strictBuffer{limit: 512 << 10}
		c.Stdout = out
		var stderr limitedBuffer
		c.Stderr = &stderr
		err = c.Run()
		data = []byte(out.String())
	}
	if err != nil {
		return nil, err
	}
	after, e := statEntry(entry.Path)
	if e != nil || after != entry || uint64(len(data)) != member.size {
		return nil, fmt.Errorf("Archive modifiée ou entrée incohérente")
	}
	return M{"data": base64.StdEncoding.EncodeToString(data)}, nil
}
