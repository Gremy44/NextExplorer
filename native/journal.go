package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type TransferEntry struct {
	Source      string `json:"source"`
	Destination string `json:"destination"`
	Status      string `json:"status"`
}
type TransferAudit struct {
	Copied         int             `json:"copied"`
	Moved          int             `json:"moved"`
	Skipped        int             `json:"skipped"`
	SourceRetained int             `json:"sourceRetained"`
	Omitted        int             `json:"omitted"`
	Entries        []TransferEntry `json:"entries"`
}
type archivedJob struct {
	ID        string        `json:"id"`
	Kind      string        `json:"kind"`
	State     string        `json:"state"`
	Error     string        `json:"error"`
	StartedAt string        `json:"startedAt"`
	Done      int64         `json:"done"`
	Total     int64         `json:"total"`
	Speed     float64       `json:"speed"`
	Eta       float64       `json:"eta"`
	Audit     TransferAudit `json:"audit"`
	Archived  bool          `json:"archived"`
}

func journalText(s string) string {
	r := []rune(s)
	if len(r) > 256 {
		return string(r[:256]) + "…"
	}
	return s
}
func (j *Job) recordTransfer(src, dst, status string) {
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.archiveRoot != "" {
		if relative, err := filepath.Rel(j.archiveRoot, src); err == nil {
			src = j.archiveSource + " › " + filepath.ToSlash(relative)
		}
	}
	switch status {
	case "copied":
		j.Audit.Copied++
	case "moved":
		j.Audit.Moved++
	case "skipped":
		j.Audit.Skipped++
	case "source-retained":
		j.Audit.SourceRetained++
	}
	if len(j.Audit.Entries) < 10 {
		j.Audit.Entries = append(j.Audit.Entries, TransferEntry{journalText(src), journalText(dst), status})
	} else {
		j.Audit.Omitted++
	}
}

// Tests use an explicit temporary directory. A missing journal never blocks file work.
func (j *Job) saveJournal() {
	if j.host == nil || j.Kind != "transfer" {
		return
	}
	err := j.writeJournal()
	j.mu.Lock()
	defer j.mu.Unlock()
	if err != nil {
		j.JournalError = "Journal non enregistré : " + journalText(err.Error())
	} else {
		j.JournalError = ""
	}
}
func (j *Job) writeJournal() error {
	dir := j.host.journalDir
	if dir == "" {
		return fmt.Errorf("stockage local indisponible")
	}
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	snapshot := j.snapshot()
	delete(snapshot, "result")
	snapshot["error"] = journalText(snapshot["error"].(string))
	snapshot["journalError"] = ""
	snapshot["archived"] = true
	data, err := json.Marshal(snapshot)
	if err != nil {
		return err
	}
	temp, err := os.CreateTemp(dir, ".journal-*")
	if err != nil {
		return err
	}
	name := temp.Name()
	defer os.Remove(name)
	if _, err = temp.Write(data); err != nil {
		temp.Close()
		return err
	}
	if err = temp.Sync(); err != nil {
		temp.Close()
		return err
	}
	if err = temp.Close(); err != nil {
		return err
	}
	if err = os.Rename(name, filepath.Join(dir, j.ID+".json")); err != nil {
		return err
	}
	files, err := journalFiles(dir)
	if err != nil {
		return err
	}
	// Keep the latest 20 records; files are unique per job, including across host processes.
	for i := 20; i < len(files); i++ {
		if err = os.Remove(filepath.Join(dir, files[i].Name())); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	return nil
}
func journalFiles(dir string) ([]os.FileInfo, error) {
	rows, err := os.ReadDir(dir)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	files := []os.FileInfo{}
	for _, row := range rows {
		if !row.Type().IsRegular() || !strings.HasPrefix(row.Name(), "job-") || !strings.HasSuffix(row.Name(), ".json") {
			continue
		}
		info, err := row.Info()
		if err != nil {
			continue
		}
		files = append(files, info)
	}
	sort.Slice(files, func(i, j int) bool { return files[i].ModTime().After(files[j].ModTime()) })
	return files, nil
}
func (h *Host) readJournal() (any, error) {
	items := []archivedJob{}
	if h.journalDir == "" {
		return items, nil
	}
	files, err := journalFiles(h.journalDir)
	if err != nil {
		return nil, err
	}
	for _, file := range files {
		if len(items) == 20 {
			break
		}
		if file.Size() > 32768 {
			continue
		}
		data, err := os.ReadFile(filepath.Join(h.journalDir, file.Name()))
		if err != nil {
			continue
		}
		var row archivedJob
		if json.Unmarshal(data, &row) != nil || row.ID != strings.TrimSuffix(file.Name(), ".json") || row.Kind != "transfer" {
			continue
		}
		row.Archived = true
		switch row.State {
		case "completed", "error", "cancelled":
		default:
			row.State = "unknown"
		}
		items = append(items, row)
	}
	return items, nil
}
