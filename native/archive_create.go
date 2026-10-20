package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func (j *Job) advancedArchive(p Payload) (any, error) {
	format := p.ArchiveFormat
	if format == "" {
		format = "zip"
	}
	if (format != "zip" && format != "7z") || len(p.Password) > 256 || strings.ContainsRune(p.Password, 0) {
		return nil, fmt.Errorf("format ou mot de passe invalide")
	}
	if err := validName(p.Name); err != nil {
		return nil, err
	}
	if !strings.EqualFold(filepath.Ext(p.Name), "."+format) {
		return nil, fmt.Errorf("l’extension du nom doit correspondre au format choisi")
	}
	dest, err := validPath(p.Destination)
	if err != nil {
		return nil, err
	}
	target := filepath.Join(dest, p.Name)
	if _, err = os.Lstat(target); !os.IsNotExist(err) {
		return nil, fmt.Errorf("archive déjà présente")
	}
	ctx, cancel := context.WithTimeout(j.ctx, 5*time.Minute)
	defer cancel()
	banner, err := commandOutput(ctx, "7z", []string{"i"}, "")
	if err != nil || !supported7zip(banner) {
		return nil, fmt.Errorf("7-Zip 26.03 ou plus récent requis")
	}
	temp, err := os.MkdirTemp(dest, ".nextexplorer-create-")
	if err != nil {
		return nil, err
	}
	if !isWithin(temp, dest) || temp == dest {
		return nil, fmt.Errorf("dossier temporaire invalide")
	}
	defer os.RemoveAll(temp)
	seed := p
	seed.Destination = temp
	seed.Name = "input.zip"
	seed.ArchiveFormat = "zip"
	seed.Password = ""
	if _, err = j.zip(seed); err != nil {
		return nil, err
	}
	// Only the validated, private snapshot is handed to 7-Zip, never live source trees.
	if _, err = j.extract(Payload{Paths: []string{filepath.Join(temp, "input.zip")}, Destination: temp, Name: "files", Conflict: "error"}); err != nil {
		return nil, err
	}
	root := filepath.Join(temp, "files")
	output := filepath.Join(temp, "output."+format)
	args := []string{"a", "-t" + format, "-y", "-bd", "-bso0", "-bsp0"}
	if p.Store {
		args = append(args, "-mx=0")
	} else {
		args = append(args, "-mx=5")
	}
	if p.Password != "" {
		args = append(args, "-p"+p.Password)
		if format == "7z" {
			args = append(args, "-mhe=on")
		} else {
			args = append(args, "-mem=AES256")
		}
	}
	args = append(args, "--", output)
	for _, path := range p.Paths {
		args = append(args, filepath.Base(path))
	}
	if _, err = commandOutput(ctx, "7z", args, root); err != nil {
		return nil, fmt.Errorf("création d’archive échouée : %w", err)
	}
	if err = j.check(); err != nil {
		return nil, err
	}
	if _, err = os.Lstat(target); !os.IsNotExist(err) {
		return nil, fmt.Errorf("destination apparue pendant la création")
	}
	return M{"path": target, "format": format}, publishFile(output, target)
}
