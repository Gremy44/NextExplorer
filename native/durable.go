package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const durableLimit = 100
const durableBytes = 4 << 20

type taskRecord struct {
	Version       int           `json:"version"`
	ID            string        `json:"id"`
	Kind          string        `json:"kind"`
	State         string        `json:"state"`
	Error         string        `json:"error,omitempty"`
	Started       time.Time     `json:"started"`
	Payload       Payload       `json:"payload"`
	Expected      []Entry       `json:"expected"`
	Destination   *Entry        `json:"destination,omitempty"`
	Next          int           `json:"next"`
	Active        bool          `json:"active"`
	Step          int           `json:"step"`
	Completed     []string      `json:"completed"`
	Done          int64         `json:"done"`
	Total         int64         `json:"total"`
	Result        any           `json:"result,omitempty"`
	Audit         TransferAudit `json:"audit"`
	NeedsPassword bool          `json:"needsPassword,omitempty"`
}

func atomicJSON(path string, value any, limit int) error {
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	if len(data) > limit {
		return fmt.Errorf("état local trop volumineux")
	}
	if err = os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(path), ".state-*")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	if _, err = f.Write(data); err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	return os.Rename(f.Name(), path)
}

func (j *Job) saveDurable() error {
	if j.host == nil || j.host.durableDir == "" {
		return nil
	}
	j.persistMu.Lock()
	defer j.persistMu.Unlock()
	j.mu.Lock()
	r := taskRecord{Version: 1, ID: j.ID, Kind: j.Kind, State: j.State, Error: j.Error, Started: j.started, Payload: j.payload, Expected: j.expected, Destination: j.destination, Next: j.next, Active: j.active, Step: j.checkpointStep, Completed: append([]string{}, j.completed...), Done: j.Done, Total: j.Total, Result: j.Result, Audit: j.Audit}
	r.Audit.Entries = append([]TransferEntry{}, j.Audit.Entries...)
	r.NeedsPassword = j.needsPassword || j.payload.Password != ""
	r.Payload.Password = ""
	if r.Active && (r.State == "running" || r.State == "paused" || r.State == "queued" || r.State == "cancelling") {
		r.Done = j.checkpointDone
	}
	j.mu.Unlock()
	return atomicJSON(filepath.Join(j.host.durableDir, j.ID+".json"), r, durableBytes)
}

func (j *Job) checkpoint(next int, active bool, completed []string) error {
	if j.host == nil || j.host.durableDir == "" {
		return nil
	}
	j.mu.Lock()
	j.next = next
	j.active = active
	j.completed = append([]string{}, completed...)
	j.checkpointStep = j.transactionStep
	j.checkpointDone = j.Done
	j.mu.Unlock()
	if err := j.saveDurable(); err != nil {
		return fmt.Errorf("tâche arrêtée : sauvegarde du point de reprise : %w", err)
	}
	return nil
}

func (h *Host) prepareJob(j *Job, p Payload) error {
	j.payload = p
	j.pending = true
	if h.durableDir == "" {
		return nil
	}
	if len(p.Paths) > 1000 {
		return fmt.Errorf("1 000 sources maximum par tâche")
	}
	for _, path := range p.Paths {
		entry, err := h.locationStat(path)
		if err != nil {
			return err
		}
		if entry.Type == "symlink" {
			return fmt.Errorf("source liée refusée")
		}
		j.expected = append(j.expected, entry)
	}
	if p.Destination != "" {
		entry, err := h.locationStat(p.Destination)
		if err != nil || entry.Type != "directory" {
			return fmt.Errorf("dossier de destination inaccessible")
		}
		j.destination = &entry
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if len(h.jobs) >= durableLimit {
		var oldest *Job
		for _, job := range h.jobs {
			job.mu.Lock()
			terminal := job.State == "completed" || job.State == "cancelled" || job.State == "error"
			job.mu.Unlock()
			if terminal && !job.pending && job != h.current && (oldest == nil || job.started.Before(oldest.started)) {
				oldest = job
			}
		}
		if oldest == nil {
			return fmt.Errorf("100 tâches conservées ; terminez ou arrêtez des tâches avant d’en créer une autre")
		}
		if err := os.Remove(filepath.Join(h.durableDir, oldest.ID+".json")); err != nil && !os.IsNotExist(err) {
			return err
		}
		delete(h.jobs, oldest.ID)
	}
	if err := j.saveDurable(); err != nil {
		return err
	}
	h.jobs[j.ID] = j
	return nil
}

func (h *Host) loadDurableJobs() error {
	if err := os.MkdirAll(h.durableDir, 0700); err != nil {
		return err
	}
	entries, err := os.ReadDir(h.durableDir)
	if err != nil {
		return err
	}
	if len(entries) > durableLimit*2 {
		return fmt.Errorf("file locale trop volumineuse ; sauvegardez et examinez le dossier des tâches")
	}
	for _, entry := range entries {
		if !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		info, err := entry.Info()
		if err != nil || !info.Mode().IsRegular() || info.Size() > durableBytes {
			return fmt.Errorf("tâche locale illisible : %s", entry.Name())
		}
		data, err := os.ReadFile(filepath.Join(h.durableDir, entry.Name()))
		if err != nil {
			return err
		}
		var r taskRecord
		if json.Unmarshal(data, &r) != nil || r.Version != 1 || !transactionID.MatchString(r.ID) || entry.Name() != r.ID+".json" || r.Next < 0 || r.Next > len(r.Payload.Paths) || len(r.Expected) != len(r.Payload.Paths) || len(r.Expected) > 1000 || r.Step < 0 {
			return fmt.Errorf("tâche locale invalide : %s", entry.Name())
		}
		ctx, cancel := context.WithCancel(context.Background())
		j := &Job{ID: r.ID, Kind: r.Kind, State: r.State, Error: r.Error, started: r.Started, ctx: ctx, cancel: cancel, host: h, payload: r.Payload, expected: r.Expected, destination: r.Destination, next: r.Next, active: r.Active, checkpointStep: r.Step, transactionStep: r.Step, completed: r.Completed, Done: r.Done, Total: r.Total, Result: r.Result, Audit: r.Audit}
		j.needsPassword = r.NeedsPassword
		j.checkpointDone = r.Done
		switch j.State {
		case "cancelling":
			j.State = "cancelled"
			j.Error = "Arrêt interrompu : vérifiez les fichiers déjà traités. Aucun rejeu proposé."
		case "queued", "running", "paused", "interrupted":
			j.State = "interrupted"
			j.recoverable = j.canRecover()
			if !j.recoverable {
				j.Error = "Interruption pendant une modification : vérifiez les fichiers et le journal. Aucun rejeu proposé."
			}
		}
		h.jobs[j.ID] = j
	}
	return nil
}

func (j *Job) canRecover() bool {
	// shortcut: remote copies require manual review after a process interruption, never automatic replay.
	if j.Kind == "remote" {
		return false
	}
	if !j.active {
		return true
	}
	if j.Kind == "scan" || j.Kind == "duplicates" {
		return true
	}
	if j.Kind != "transfer" {
		return false
	}
	dir, err := j.host.transactionDir(j.ID)
	if err != nil {
		return false
	}
	files, err := os.ReadDir(dir)
	if os.IsNotExist(err) {
		return j.checkpointStep == 0
	}
	if err != nil || len(files) > 20002 {
		return false
	}
	for _, file := range files {
		event, err := readTransactionEvent(dir, file.Name())
		if err != nil || event.Step > j.checkpointStep || event.Phase == "end" {
			return false
		}
	}
	return true
}

func (h *Host) recoverJob(j *Job, password string) (any, error) {
	j.mu.Lock()
	if j.needsPassword && (password == "" || len(password) > 256) {
		j.mu.Unlock()
		return nil, fmt.Errorf("saisissez à nouveau le mot de passe de cette archive")
	}
	if j.State != "interrupted" || !j.recoverable {
		j.mu.Unlock()
		return nil, fmt.Errorf("cette tâche ne peut pas être reprise sans vérification manuelle")
	}
	j.State = "checking"
	j.payload.Password = password
	j.mu.Unlock()
	refuse := func(err error) (any, error) {
		j.mu.Lock()
		j.State = "interrupted"
		j.Error = err.Error()
		j.mu.Unlock()
		j.emit()
		return nil, err
	}
	start := 0
	if j.Kind == "transfer" || j.Kind == "convert" || j.Kind == "recipe" || j.Kind == "quick" {
		start = j.next
	}
	for i := start; i < len(j.expected); i++ {
		actual, err := statEntry(j.expected[i].Path)
		if err != nil || actual != j.expected[i] {
			return refuse(fmt.Errorf("source modifiée depuis l’interruption : %s", j.expected[i].Name))
		}
	}
	if j.destination != nil {
		actual, err := statEntry(j.destination.Path)
		if err != nil || actual.Type != "directory" {
			return refuse(fmt.Errorf("destination devenue indisponible"))
		}
	}
	if !j.canRecover() {
		return refuse(fmt.Errorf("journal modifié : reprise refusée"))
	}
	j.mu.Lock()
	j.ctx, j.cancel = context.WithCancel(context.Background())
	j.State = "queued"
	j.Error = ""
	j.resuming = true
	j.active = false
	j.mu.Unlock()
	if err := j.saveDurable(); err != nil {
		return refuse(err)
	}
	h.runJob(j)
	return M{"jobId": j.ID}, nil
}

func (h *Host) sortedJobs() []*Job {
	h.mu.Lock()
	defer h.mu.Unlock()
	items := make([]*Job, 0, len(h.jobs))
	for _, j := range h.jobs {
		items = append(items, j)
	}
	sort.Slice(items, func(i, k int) bool { return items[i].started.Before(items[k].started) })
	return items
}
