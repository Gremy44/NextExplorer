package main

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestJournalPersistenceAndIncompleteStatus(t *testing.T) {
	h := newHost(io.Discard)
	h.journalDir = t.TempDir()
	j := jobForTest()
	j.host = h
	j.ID = "job-test"
	j.Kind = "transfer"
	j.State = "queued"
	j.started = time.Now()
	j.saveJournal()
	if j.JournalError != "" {
		t.Fatal(j.JournalError)
	}
	value, err := h.readJournal()
	if err != nil {
		t.Fatal(err)
	}
	rows := value.([]archivedJob)
	if len(rows) != 1 || rows[0].State != "unknown" {
		t.Fatal(rows)
	}
	j.recordTransfer("source", "target", "copied")
	j.State = "completed"
	j.saveJournal()
	if j.JournalError != "" {
		t.Fatal(j.JournalError)
	}
	reopened := newHost(io.Discard)
	reopened.journalDir = h.journalDir
	value, err = reopened.readJournal()
	if err != nil {
		t.Fatal(err)
	}
	rows = value.([]archivedJob)
	if len(rows) != 1 || rows[0].State != "completed" || rows[0].Audit.Copied != 1 {
		t.Fatal(rows)
	}
	// Mutation of a snapshot must not mutate the live job report.
	audit := j.snapshot()["audit"].(TransferAudit)
	audit.Entries[0].Status = "bad"
	if j.Audit.Entries[0].Status != "copied" {
		t.Fatal("snapshot aliases live entries")
	}
	os.WriteFile(filepath.Join(h.journalDir, "job-corrupt.json"), []byte("{"), 0600)
	value, _ = h.readJournal()
	if len(value.([]archivedJob)) != 1 {
		t.Fatal("corruption not ignored")
	}
}

func TestJournalBoundsAndWriteFailure(t *testing.T) {
	h := newHost(io.Discard)
	h.journalDir = t.TempDir()
	for i := 0; i < 23; i++ {
		j := jobForTest()
		j.host = h
		j.ID = fmt.Sprintf("job-%02d", i)
		j.Kind = "transfer"
		j.State = "completed"
		for k := 0; k < 15; k++ {
			j.recordTransfer("src", "dst", "skipped")
		}
		j.saveJournal()
		if j.JournalError != "" {
			t.Fatal(j.JournalError)
		}
	}
	value, err := h.readJournal()
	if err != nil {
		t.Fatal(err)
	}
	rows := value.([]archivedJob)
	if len(rows) != 20 {
		t.Fatal(len(rows))
	}
	for _, r := range rows {
		if len(r.Audit.Entries) != 10 || r.Audit.Skipped != 15 || r.Audit.Omitted != 5 {
			t.Fatal(r)
		}
	}
	bad := filepath.Join(t.TempDir(), "file")
	os.WriteFile(bad, []byte("occupied"), 0600)
	h.journalDir = bad
	j := jobForTest()
	j.host = h
	j.Kind = "transfer"
	j.ID = "job-failure"
	j.saveJournal()
	if j.JournalError == "" {
		t.Fatal("write failure hidden")
	}
}

func TestMergeJournalRecordsSkippedAndMovedChildren(t *testing.T) {
	root := t.TempDir()
	src := filepath.Join(root, "src", "folder")
	dst := filepath.Join(root, "dst")
	os.MkdirAll(src, 0700)
	os.MkdirAll(filepath.Join(dst, "folder"), 0700)
	put(t, filepath.Join(src, "keep.txt"), "source")
	put(t, filepath.Join(dst, "folder", "keep.txt"), "target")
	put(t, filepath.Join(src, "move.txt"), "move")
	j := jobForTest()
	_, err := j.transfer(Payload{Paths: []string{src}, Destination: dst, Mode: "move", Conflict: "skip", Merge: true})
	if err != nil {
		t.Fatal(err)
	}
	if j.Audit.Skipped != 1 || j.Audit.Moved != 1 || j.Audit.Copied != 0 {
		t.Fatal(j.Audit)
	}
	if _, err := os.Stat(filepath.Join(src, "keep.txt")); err != nil {
		t.Fatal(err)
	}
}
