package main

import (
	"archive/zip"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type engineEntry struct {
	name      string
	size      uint64
	directory bool
}
type strictBuffer struct {
	strings.Builder
	limit int
}

func (b *strictBuffer) Write(p []byte) (int, error) {
	if len(p) > b.limit-b.Len() {
		return 0, fmt.Errorf("inventaire trop volumineux")
	}
	return b.Builder.Write(p)
}
func parseEngineList(text string) ([]engineEntry, error) {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	entries := []engineEntry{}
	seen := map[string]bool{}
	var total uint64
	for _, block := range strings.Split(strings.TrimSpace(text), "\n\n") {
		if strings.TrimSpace(block) == "" {
			continue
		}
		fields := map[string]string{}
		for _, line := range strings.Split(block, "\n") {
			if strings.TrimSpace(line) == "" {
				continue
			}
			k, v, ok := strings.Cut(line, " =")
			v = strings.TrimPrefix(v, " ")
			if !ok {
				return nil, fmt.Errorf("inventaire ambigu : %s", journalText(line))
			}
			if _, exists := fields[k]; exists {
				return nil, fmt.Errorf("champ d'inventaire dupliqué")
			}
			fields[k] = v
		}
		name := strings.ReplaceAll(fields["Path"], "\\", "/")
		if strings.HasPrefix(name, "@") || strings.ContainsAny(name, "\r\n") {
			return nil, fmt.Errorf("nom ambigu dans l'archive")
		}
		rel, err := zipRelative(name)
		if err != nil {
			return nil, err
		}
		key := strings.ToLower(rel)
		if seen[key] {
			return nil, fmt.Errorf("noms d'archive dupliqués")
		}
		seen[key] = true
		for _, k := range []string{"Symbolic Link", "Hard Link", "Copy Link", "Reparse", "Alternate Stream"} {
			if v := fields[k]; v != "" && v != "-" {
				return nil, fmt.Errorf("liens et flux alternatifs refusés")
			}
		}
		attributes := fields["Attributes"]
		for _, word := range strings.Fields(attributes) {
			if len(word) == 10 && word[0] != '-' && word[0] != 'd' {
				return nil, fmt.Errorf("fichier spécial refusé")
			}
		}
		if fields["Encrypted"] != "-" && fields["Encrypted"] != "" {
			return nil, fmt.Errorf("archive chiffrée non prise en charge")
		}
		if fields["Split Before"] == "+" || fields["Split After"] == "+" {
			return nil, fmt.Errorf("archive multivolume refusée")
		}
		size, err := strconv.ParseUint(fields["Size"], 10, 64)
		if err != nil {
			return nil, fmt.Errorf("taille d'entrée absente ou invalide")
		}
		if size > extractMaxFile || size > extractMaxBytes-total {
			return nil, fmt.Errorf("limites de décompression dépassées")
		}
		total += size
		directory := fields["Folder"] == "+" || strings.HasPrefix(attributes, "D")
		entries = append(entries, engineEntry{name, size, directory})
		if len(entries) > 3000 {
			return nil, fmt.Errorf("archive limitée à 3 000 entrées")
		}
	}
	return entries, nil
}

type archiveSink struct {
	job       *Job
	out       io.Writer
	remaining uint64
}

func (w *archiveSink) Write(p []byte) (int, error) {
	if err := w.job.check(); err != nil {
		return 0, err
	}
	if uint64(len(p)) > w.remaining {
		return 0, fmt.Errorf("taille décompressée supérieure à l'inventaire")
	}
	n, err := w.out.Write(p)
	w.remaining -= uint64(n)
	w.job.progress(int64(n))
	return n, err
}

// 7-Zip never receives an output directory: bytes go through bounded Go writers.
func (j *Job) convertArchive(source, dest, extension string) (string, func(), error) {
	engine, err := toolPath("7z")
	if err != nil {
		return "", nil, err
	}
	ctx, cancel := context.WithTimeout(j.ctx, 5*time.Minute)
	defer cancel()
	versionCommand := exec.CommandContext(ctx, engine, "i")
	quiet(versionCommand)
	var versionOutput limitedBuffer
	versionCommand.Stdout = &versionOutput
	if err := versionCommand.Run(); err != nil {
		return "", nil, fmt.Errorf("version 7-Zip inaccessible : %w", err)
	}
	if !supported7zip(versionOutput.String()) {
		return "", nil, fmt.Errorf("7-Zip 26.03 ou plus récent requis : mettez à jour le moteur avec setup-engines.ps1 puis réinstallez le compagnon")
	}
	temp, err := os.MkdirTemp(dest, ".nextexplorer-engine-")
	if err != nil {
		return "", nil, err
	}
	if !filepath.IsAbs(temp) || temp == dest || !isWithin(temp, dest) {
		return "", nil, fmt.Errorf("dossier temporaire hors destination")
	}
	cleanup := func() { os.RemoveAll(temp) }
	success := false
	defer func() {
		if !success {
			cleanup()
		}
	}()
	// Snapshot prevents the original archive changing between inventory and extraction.
	input, err := os.Open(source)
	if err != nil {
		return "", nil, err
	}
	defer input.Close()
	snapshot := filepath.Join(temp, "input"+extension)
	copyFile, err := os.OpenFile(snapshot, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return "", nil, err
	}
	snapshotSink := &archiveSink{job: j, out: copyFile, remaining: extractMaxBytes}
	_, err = io.Copy(snapshotSink, input)
	closeErr := copyFile.Close()
	if err != nil {
		return "", nil, err
	}
	if closeErr != nil {
		return "", nil, closeErr
	}
	j.mu.Lock()
	j.Done = 0
	j.mu.Unlock()
	kind := "-t7z"
	if extension == ".rar" {
		kind = "-trar"
		probe, err := os.Open(snapshot)
		if err != nil {
			return "", nil, err
		}
		header := make([]byte, 8)
		n, _ := probe.Read(header)
		probe.Close()
		if n == 8 && string(header) == "Rar!\x1a\x07\x01\x00" {
			kind = "-trar5"
		}
	}
	args := []string{"l", kind, "-slt", "-sccUTF-8", "-pNextExplorer-no-password", "--", snapshot}
	command := exec.CommandContext(ctx, engine, args...)
	quiet(command)
	listing := &strictBuffer{limit: 1024 * 1024}
	command.Stdout = listing
	var stderr limitedBuffer
	command.Stderr = &stderr
	if err := command.Run(); err != nil {
		return "", nil, fmt.Errorf("inventaire 7-Zip impossible : %w", err)
	}
	headerText, entryText, found := strings.Cut(strings.ReplaceAll(listing.String(), "\r\n", "\n"), "\n----------\n")
	if !found {
		return "", nil, fmt.Errorf("inventaire d'archive incomplet")
	}
	for _, line := range strings.Split(headerText, "\n") {
		if line == "Multivolume = +" || line == "Volume = +" {
			return "", nil, fmt.Errorf("archive multivolume refusée")
		}
		if strings.HasPrefix(line, "Volumes = ") && strings.TrimPrefix(line, "Volumes = ") != "1" {
			return "", nil, fmt.Errorf("archive multivolume refusée")
		}
	}
	entries, err := parseEngineList(entryText)
	if err != nil {
		return "", nil, err
	}
	var total uint64
	for _, entry := range entries {
		total += entry.size
	}
	j.mu.Lock()
	j.Total = int64(total)
	j.mu.Unlock()
	outputPath := filepath.Join(temp, "validated.zip")
	output, err := os.Create(outputPath)
	if err != nil {
		return "", nil, err
	}
	defer output.Close()
	writer := zip.NewWriter(output)
	for _, entry := range entries {
		if err := j.check(); err != nil {
			writer.Close()
			return "", nil, err
		}
		name := entry.name
		if entry.directory {
			name = strings.TrimSuffix(name, "/") + "/"
		}
		member, err := writer.CreateHeader(&zip.FileHeader{Name: name, Method: zip.Store})
		if err != nil {
			writer.Close()
			return "", nil, err
		}
		if entry.directory {
			continue
		}
		command := exec.CommandContext(ctx, engine, "x", kind, "-so", "-spd", "-r-", "-y", "-bso0", "-bsp0", "-pNextExplorer-no-password", "--", snapshot, entry.name)
		quiet(command)
		sink := &archiveSink{job: j, out: member, remaining: entry.size}
		command.Stdout = sink
		var errors limitedBuffer
		command.Stderr = &errors
		if err := command.Run(); err != nil {
			writer.Close()
			return "", nil, fmt.Errorf("décompression 7-Zip échouée : %w", err)
		}
		if sink.remaining != 0 {
			writer.Close()
			return "", nil, fmt.Errorf("taille extraite différente de l'inventaire")
		}
	}
	if err := writer.Close(); err != nil {
		return "", nil, err
	}
	if err := output.Close(); err != nil {
		return "", nil, err
	}
	success = true
	return outputPath, cleanup, nil
}

func supported7zip(banner string) bool {
	parts := regexp.MustCompile(`(?m)^7-Zip\s+(\d+)\.(\d+)(?:\s|$)`).FindStringSubmatch(banner)
	if len(parts) != 3 {
		return false
	}
	major, e1 := strconv.Atoi(parts[1])
	minor, e2 := strconv.Atoi(parts[2])
	return e1 == nil && e2 == nil && (major > 26 || major == 26 && minor >= 3)
}
