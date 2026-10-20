package main

import (
	"context"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func durableHost(t *testing.T) *Host {
	t.Helper()
	h := newHost(io.Discard)
	root := t.TempDir()
	h.durableDir = filepath.Join(root, "tasks")
	h.journalDir = filepath.Join(root, "journal")
	return h
}
func preparedTask(t *testing.T, h *Host, kind string, p Payload) *Job {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	j := &Job{ID: "job-" + randomID(), Kind: kind, State: "running", started: time.Now(), ctx: ctx, cancel: cancel, host: h}
	if err := h.prepareJob(j, p); err != nil {
		t.Fatal(err)
	}
	h.jobs[j.ID] = j
	return j
}
func reopenTasks(t *testing.T, h *Host) *Host {
	t.Helper()
	other := newHost(io.Discard)
	other.durableDir = h.durableDir
	other.journalDir = h.journalDir
	if err := other.loadDurableJobs(); err != nil {
		t.Fatal(err)
	}
	return other
}
func awaitTask(t *testing.T, j *Job) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		state := j.snapshot()["state"]
		j.host.mu.Lock()
		finished := j.host.current != j
		j.host.mu.Unlock()
		if state == "completed" && finished {
			return
		}
		if state == "error" || state == "cancelled" {
			t.Fatal(j.snapshot())
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("task did not finish", j.snapshot())
}
func TestDurableMoveResumesAtCheckpointAndRemainsUndoable(t *testing.T) {
	h := durableHost(t)
	source := t.TempDir()
	dest := t.TempDir()
	a := filepath.Join(source, "a.txt")
	b := filepath.Join(source, "b.txt")
	put(t, a, "alpha")
	put(t, b, "bravo")
	p := Payload{Paths: []string{a, b}, Destination: dest, Mode: "move", Conflict: "rename"}
	j := preparedTask(t, h, "transfer", p)
	if _, err := j.beginTransaction(p); err != nil {
		t.Fatal(err)
	}
	if err := j.checkpoint(0, true, nil); err != nil {
		t.Fatal(err)
	}
	target, err := j.transferEntry(a, filepath.Join(dest, "a.txt"), p, false)
	if err != nil {
		t.Fatal(err)
	}
	if err := j.checkpoint(1, false, []string{target}); err != nil {
		t.Fatal(err)
	}
	other := reopenTasks(t, h)
	recovered := other.jobs[j.ID]
	if recovered.State != "interrupted" || !recovered.recoverable {
		t.Fatal(recovered.snapshot())
	}
	if _, err = other.recoverJob(recovered, ""); err != nil {
		t.Fatal(err)
	}
	awaitTask(t, recovered)
	files, _ := os.ReadDir(dest)
	if len(files) != 2 {
		t.Fatal("completed source replayed", files)
	}
	if _, err = os.Stat(a); !os.IsNotExist(err) {
		t.Fatal("source move lost")
	}
	report := other.inspectUndo(j.ID)
	if !report.Eligible || report.Count != 2 {
		t.Fatal(report)
	}
	if _, err := other.undoCopy(j.ID); err != nil {
		t.Fatal(err)
	}
	if data, _ := os.ReadFile(a); string(data) != "alpha" {
		t.Fatal("undo missing original")
	}
}
func TestDurableAmbiguousMutationNeverReplays(t *testing.T) {
	h := durableHost(t)
	source := filepath.Join(t.TempDir(), "a.txt")
	put(t, source, "keep")
	p := Payload{Paths: []string{source}, Destination: t.TempDir(), Mode: "copy", Conflict: "rename"}
	j := preparedTask(t, h, "transfer", p)
	j.beginTransaction(p)
	j.checkpoint(0, true, nil)
	if _, err := j.transferEntry(source, filepath.Join(p.Destination, "a.txt"), p, false); err != nil {
		t.Fatal(err)
	}
	other := reopenTasks(t, h)
	recovered := other.jobs[j.ID]
	if recovered.recoverable {
		t.Fatal("ambiguous publication offered replay")
	}
	if _, err := other.recoverJob(recovered, ""); err == nil {
		t.Fatal("replay accepted")
	}
	files, _ := os.ReadDir(p.Destination)
	if len(files) != 1 {
		t.Fatal(files)
	}
}
func TestDurableQueuedSourcesAndPassword(t *testing.T) {
	h := durableHost(t)
	source := filepath.Join(t.TempDir(), "a.txt")
	put(t, source, "first")
	p := Payload{Paths: []string{source}, Destination: t.TempDir(), Name: "secret.7z", ArchiveFormat: "7z", Password: "NEVER-ON-DISK-123"}
	j := preparedTask(t, h, "zip", p)
	data, _ := os.ReadFile(filepath.Join(h.durableDir, j.ID+".json"))
	if strings.Contains(string(data), p.Password) {
		t.Fatal("password persisted")
	}
	other := reopenTasks(t, h)
	recovered := other.jobs[j.ID]
	if !recovered.recoverable || !recovered.needsPassword {
		t.Fatal(recovered.snapshot())
	}
	if _, err := other.recoverJob(recovered, ""); err == nil {
		t.Fatal("missing password accepted")
	}
	put(t, source, "changed")
	if _, err := other.recoverJob(recovered, p.Password); err == nil {
		t.Fatal("changed source accepted")
	}
	files, _ := os.ReadDir(p.Destination)
	if len(files) != 0 {
		t.Fatal("unconfirmed job executed")
	}
}
func TestDurableStorageFailureAndCorruption(t *testing.T) {
	h := durableHost(t)
	put(t, h.durableDir, "not a directory")
	if _, err := h.startJob("scan", Payload{Path: t.TempDir()}); err == nil {
		t.Fatal("non-durable job started")
	}
	h = durableHost(t)
	os.MkdirAll(h.durableDir, 0700)
	put(t, filepath.Join(h.durableDir, "job-corrupt.json"), "{")
	if err := h.loadDurableJobs(); err == nil {
		t.Fatal("corrupt record replayed")
	}
}
func TestCancelledQueuedTaskCannotBeRecoveredAfterRestart(t *testing.T) {
	h := durableHost(t)
	source := filepath.Join(t.TempDir(), "a.txt")
	put(t, source, "keep")
	j := preparedTask(t, h, "transfer", Payload{Paths: []string{source}, Destination: t.TempDir(), Mode: "copy", Conflict: "rename"})
	j.State = "queued"
	j.control("cancel")
	other := reopenTasks(t, h)
	recovered := other.jobs[j.ID]
	if recovered.State != "cancelled" || recovered.recoverable {
		t.Fatal(recovered.snapshot())
	}
	if _, err := other.recoverJob(recovered, ""); err == nil {
		t.Fatal("cancelled job recovered")
	}
}
func TestDirectMutationsDoNotWaitBehindPausedJob(t *testing.T) {
	h := durableHost(t)
	h.mutateMu.Lock()
	defer h.mutateMu.Unlock()
	for _, action := range []string{"FS_WRITE", "FS_UPLOAD", "FS_MKDIR", "FS_RENAME", "FS_TRASH", "FS_RESTORE", "TRANSFER_UNDO_CHECK", "TRANSFER_UNDO_RESUME", "TRANSFER_UNDO", "BATCH_RENAME"} {
		result := make(chan error, 1)
		go func() { _, err := h.dispatch(Request{Action: action}); result <- err }()
		select {
		case err := <-result:
			if err == nil || !strings.Contains(err.Error(), "bloque les modifications") {
				t.Fatal(action, err)
			}
		case <-time.After(time.Second):
			t.Fatal(action, "was deferred instead of refused")
		}
	}
	if _, err := h.dispatch(Request{Action: "FS_STAT", Payload: json.RawMessage(`{"path":` + strconv.Quote(t.TempDir()) + `}`)}); err != nil {
		t.Fatal("navigation blocked", err)
	}
}

func TestCompletedJobAllowsNextDirectMutation(t *testing.T) {
	h := durableHost(t)
	dir := t.TempDir()
	source := filepath.Join(dir, "source.txt")
	put(t, source, "keep")
	dest := t.TempDir()
	result := make(chan error, 1)
	h.broadcast = func(value any) {
		row, ok := value.(M)
		if !ok || row["event"] != "JOB_UPDATE" || row["data"].(M)["state"] != "completed" {
			return
		}
		payload, _ := json.Marshal(Payload{Path: dir, Name: "after-completion"})
		_, err := h.dispatch(Request{Action: "FS_MKDIR", Payload: payload})
		result <- err
	}
	if _, err := h.startJob("transfer", Payload{Paths: []string{source}, Destination: dest, Mode: "copy", Conflict: "rename"}); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-result:
		if err != nil {
			t.Fatal("completed task still blocks mutation", err)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("task did not finish")
	}
	if _, err := os.Stat(filepath.Join(dir, "after-completion")); err != nil {
		t.Fatal(err)
	}
}

func TestDurableConversionResultSurvivesRestart(t *testing.T) {
	h := durableHost(t)
	j := preparedTask(t, h, "convert", Payload{})
	j.State = "completed"
	j.active = true
	j.Done, j.Total = 2, 2
	j.Result = []string{"C:\\copy.webp"}
	if err := j.saveDurable(); err != nil {
		t.Fatal(err)
	}
	other := reopenTasks(t, h)
	if other.jobs[j.ID].Done != 2 {
		t.Fatal("terminal progress replaced by old checkpoint", other.jobs[j.ID].snapshot())
	}
	result, err := other.dispatch(Request{Action: "JOB_RESULT", Payload: json.RawMessage(`{"jobId":"` + j.ID + `"}`)})
	if err != nil || len(result.([]any)) != 1 || result.([]any)[0] != "C:\\copy.webp" {
		t.Fatal(result, err)
	}
}
