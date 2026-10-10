package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

func transactionalJob(t *testing.T) *Job {
	t.Helper()
	j := jobForTest()
	j.Kind = "transfer"
	j.ID = "job-transaction-test"
	j.host.journalDir = t.TempDir()
	return j
}

func transactionEvents(t *testing.T, j *Job) []transactionEvent {
	t.Helper()
	files, err := os.ReadDir(filepath.Join(j.host.journalDir, "transactions", j.ID))
	if err != nil {
		t.Fatal(err)
	}
	var events []transactionEvent
	for _, file := range files {
		data, err := os.ReadFile(filepath.Join(j.host.journalDir, "transactions", j.ID, file.Name()))
		if err != nil {
			t.Fatal(err)
		}
		var event transactionEvent
		if err = json.Unmarshal(data, &event); err != nil {
			t.Fatal(err)
		}
		if event.Phase == "intent" || event.Phase == "result" {
			events = append(events, event)
		}
	}
	return events
}

func TestTransactionMoveOverwriteEvidence(t *testing.T) {
	j := transactionalJob(t)
	root := t.TempDir()
	src, dst := filepath.Join(root, "src"), filepath.Join(root, "dst")
	os.Mkdir(src, 0700)
	os.Mkdir(dst, 0700)
	put(t, filepath.Join(src, "file.txt"), "new")
	put(t, filepath.Join(dst, "file.txt"), "old")
	_, err := j.transfer(Payload{Paths: []string{filepath.Join(src, "file.txt")}, Destination: dst, Mode: "move", Conflict: "overwrite"})
	if err != nil {
		t.Fatal(err)
	}
	events := transactionEvents(t, j)
	if len(events) != 6 {
		t.Fatal(events)
	}
	for i, action := range []string{"trash-destination", "publish-file", "remove-source"} {
		a, b := events[2*i], events[2*i+1]
		if a.Action != action || a.Phase != "intent" || b.Phase != "result" || b.Error != "" || a.Hash == "" || a.Hash != b.Hash || a.Version != 1 {
			t.Fatal(a, b)
		}
	}
	if events[0].TrashRecord == "" {
		t.Fatal("missing recovery record")
	}
	data, err := os.ReadFile(events[0].Destination)
	if err != nil || string(data) != "old" {
		t.Fatal(string(data), err)
	}
	if _, err = os.Stat(events[0].TrashRecord); err != nil {
		t.Fatal(err)
	}
	if _, err = os.Stat(filepath.Join(src, "file.txt")); !os.IsNotExist(err) {
		t.Fatal(err)
	}
	data, err = os.ReadFile(filepath.Join(j.host.journalDir, "transactions", j.ID, "00000000-end.json"))
	var end transactionEvent
	if err != nil || json.Unmarshal(data, &end) != nil || end.Phase != "end" || end.Error != "" || end.Mode != "move" {
		t.Fatal(string(data), err)
	}
}

func TestTransactionMergeSkipsAndCancellation(t *testing.T) {
	for _, cancel := range []bool{false, true} {
		t.Run(fmt.Sprint(cancel), func(t *testing.T) {
			j := transactionalJob(t)
			root := t.TempDir()
			src, dst := filepath.Join(root, "src", "folder"), filepath.Join(root, "dst")
			os.MkdirAll(src, 0700)
			os.MkdirAll(filepath.Join(dst, "folder"), 0700)
			put(t, filepath.Join(src, "keep.txt"), "source")
			put(t, filepath.Join(dst, "folder", "keep.txt"), "destination")
			put(t, filepath.Join(src, "new.txt"), "new")
			if cancel {
				j.cancel()
			}
			_, err := j.transfer(Payload{Paths: []string{src}, Destination: dst, Mode: "move", Conflict: "skip", Merge: true})
			if cancel != (err != nil) {
				t.Fatal(err)
			}
			events := transactionEvents(t, j)
			if cancel && len(events) != 0 {
				t.Fatal(events)
			}
			if !cancel && len(events) != 4 {
				t.Fatal(events)
			}
			data, err := os.ReadFile(filepath.Join(src, "keep.txt"))
			if err != nil || string(data) != "source" {
				t.Fatal(err)
			}
		})
	}
}

func TestTransactionPersistsAllFilesAndEmptyDirectories(t *testing.T) {
	j := transactionalJob(t)
	root := t.TempDir()
	src, dst := filepath.Join(root, "src"), filepath.Join(root, "dst")
	os.MkdirAll(filepath.Join(src, "empty"), 0700)
	os.Mkdir(dst, 0700)
	for i := 0; i < 12; i++ {
		put(t, filepath.Join(src, fmt.Sprintf("%02d.txt", i)), "content")
	}
	_, err := j.transfer(Payload{Paths: []string{src}, Destination: dst, Mode: "move", Conflict: "rename"})
	if err != nil {
		t.Fatal(err)
	}
	events := transactionEvents(t, j)
	counts := map[string]int{}
	for _, event := range events {
		if event.Phase == "result" && event.Error == "" {
			counts[event.Action]++
		}
	}
	if counts["publish-file"] != 12 || counts["remove-source"] != 12 || counts["create-directory"] != 2 || counts["remove-directory"] != 2 {
		t.Fatal(counts)
	}
	if j.Audit.Omitted != 2 {
		t.Fatal(j.Audit)
	}
}

func TestTransactionFailsClosedAndRetainsUncertainIntent(t *testing.T) {
	t.Run("before mutation", func(t *testing.T) {
		j := transactionalJob(t)
		j.host.journalDir = filepath.Join(t.TempDir(), "blocked")
		put(t, j.host.journalDir, "file")
		called := false
		err := j.transaction("publish-file", "src", "dst", "hash", "", func() error { called = true; return nil })
		if err == nil || called {
			t.Fatal("mutation permitted without durable intent", err)
		}
	})
	t.Run("after mutation", func(t *testing.T) {
		j := transactionalJob(t)
		err := j.transaction("publish-file", "src", "dst", "hash", "", func() error {
			// Simulate inability to persist the result after the filesystem changed.
			return os.Mkdir(filepath.Join(j.host.journalDir, "transactions", j.ID, "00000001-result.json"), 0700)
		})
		if err == nil {
			t.Fatal("missing uncertainty error")
		}
		data, err := os.ReadFile(filepath.Join(j.host.journalDir, "transactions", j.ID, "00000001-intent.json"))
		if err != nil || !json.Valid(data) {
			t.Fatal("intent lost", err)
		}
	})
	t.Run("failed mutation", func(t *testing.T) {
		j := transactionalJob(t)
		if err := j.transaction("remove-source", "src", "dst", "hash", "", func() error { return os.ErrPermission }); err == nil {
			t.Fatal("failure hidden")
		}
		events := transactionEvents(t, j)
		if len(events) != 2 || events[1].Error == "" {
			t.Fatal(events)
		}
	})
}
