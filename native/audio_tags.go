package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func (j *Job) editAudioTags(path string, p Payload) error {
	before, e := os.Stat(path)
	if e != nil {
		return e
	}
	f, e := os.CreateTemp(filepath.Dir(path), ".nextexplorer-tags-*"+filepath.Ext(path))
	if e != nil {
		return e
	}
	temp := f.Name()
	f.Close()
	defer os.Remove(temp)
	args := []string{"-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", path, "-map", "0", "-c", "copy"}
	if p.Strip {
		args = append(args, "-map_metadata", "-1")
	}
	for key, value := range p.Tags {
		tag := strings.ToLower(key)
		if key == "Year" {
			tag = "date"
		}
		args = append(args, "-metadata", tag+"="+value)
	}
	if strings.EqualFold(filepath.Ext(path), ".mp3") {
		args = append(args, "-id3v2_version", "3")
	}
	args = append(args, temp)
	if _, e = commandOutput(j.ctx, "ffmpeg", args, ""); e != nil {
		return e
	}
	if e = j.check(); e != nil {
		return e
	}
	after, e := os.Stat(path)
	if e != nil {
		return e
	}
	if after.Size() != before.Size() || !after.ModTime().Equal(before.ModTime()) {
		return fmt.Errorf("source modifiée pendant l'écriture des tags")
	}
	backup := path + "_original"
	if _, e = os.Lstat(backup); !os.IsNotExist(e) {
		backup = uniquePath(backup)
	}
	if e = publishFile(path, backup); e != nil {
		return e
	}
	if e = publishFile(temp, path); e != nil {
		if rollback := publishFile(backup, path); rollback != nil {
			return fmt.Errorf("%v ; original à restaurer : %s (%v)", e, backup, rollback)
		}
		return e
	}
	return nil
}
