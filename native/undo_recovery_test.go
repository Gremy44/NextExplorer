package main

import (
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestUndoRecovery(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows recovery lock")
	}
	for _, scenario := range []string{"empty-claim", "begin-only", "prefix", "move-prefix", "finished", "intent-only", "error-result", "out-of-order", "changed-done", "changed-pending", "corrupt", "move", "replace", "tree", "merge"} {
		t.Run(scenario, func(t *testing.T) {
			j := transactionalJob(t)
			root := t.TempDir()
			src, dst := filepath.Join(root, "src"), filepath.Join(root, "dst")
			for _, p := range []string{src, dst} {
				if err := os.Mkdir(p, 0700); err != nil {
					t.Fatal(err)
				}
			}
			put(t, filepath.Join(src, "a.txt"), "a")
			put(t, filepath.Join(src, "b.txt"), "b")
			payload := Payload{Paths: []string{filepath.Join(src, "a.txt"), filepath.Join(src, "b.txt")}, Destination: dst, Mode: "copy", Conflict: "rename"}
			if scenario == "move" || scenario == "move-prefix" {
				payload.Mode = "move"
			}
			if scenario == "replace" {
				payload.Conflict = "overwrite"
				put(t, filepath.Join(dst, "a.txt"), "old a")
			}
			if scenario == "tree" || scenario == "merge" {
				payload.Paths = []string{src}
				if scenario == "merge" {
					payload.Mode = "move"
					payload.Merge = true
					if err := os.Mkdir(filepath.Join(dst, "src"), 0700); err != nil {
						t.Fatal(err)
					}
				}
			}
			if _, err := j.transfer(payload); err != nil {
				t.Fatal(err)
			}
			dir, _ := j.host.transactionDir(j.ID)
			dir = filepath.Join(dir, "undo")
			if scenario == "empty-claim" || scenario == "begin-only" {
				if err := os.Mkdir(dir, 0700); err != nil {
					t.Fatal(err)
				}
				if scenario == "begin-only" {
					if err := writeTransactionEvent(dir, transactionEvent{Action: "undo", Phase: "begin"}); err != nil {
						t.Fatal(err)
					}
				}
			} else {
				if _, err := j.host.undoCopy(j.ID); err != nil {
					t.Fatal(err)
				}
				if err := os.Remove(filepath.Join(dir, "00000000-end.json")); err != nil {
					t.Fatal(err)
				}
				if scenario == "prefix" || scenario == "move-prefix" || scenario == "changed-pending" {
					event, err := readTransactionEvent(dir, "00000003-result.json")
					if err != nil {
						t.Fatal(err)
					}
					if scenario == "move-prefix" {
						if err := moveUndoEntry(event.Destination, event.Source); err != nil {
							t.Fatal(err)
						}
					} else if _, err := restoreTrash(event.TrashRecord); err != nil {
						t.Fatal(err)
					}
					for _, phase := range []string{"intent", "result"} {
						if err := os.Remove(filepath.Join(dir, "00000003-"+phase+".json")); err != nil {
							t.Fatal(err)
						}
					}
					if scenario == "changed-pending" {
						put(t, filepath.Join(src, "a.txt"), "edit")
					}
				}
				if scenario == "intent-only" || scenario == "out-of-order" {
					if err := os.Remove(filepath.Join(dir, "00000001-result.json")); err != nil {
						t.Fatal(err)
					}
				}
				if scenario == "out-of-order" {
					if err := os.Remove(filepath.Join(dir, "00000001-intent.json")); err != nil {
						t.Fatal(err)
					}
				}
				if scenario == "error-result" {
					event, _ := readTransactionEvent(dir, "00000001-result.json")
					event.Error = "interrupted"
					data, _ := json.Marshal(event)
					if err := os.WriteFile(filepath.Join(dir, "00000001-result.json"), data, 0600); err != nil {
						t.Fatal(err)
					}
				}
				if scenario == "changed-done" {
					event, _ := readTransactionEvent(dir, "00000001-result.json")
					put(t, event.Destination, "edit")
				}
				if scenario == "corrupt" {
					put(t, filepath.Join(dir, "00000001-result.json"), "{")
				}
			}
			h := newHost(io.Discard)
			h.journalDir = j.host.journalDir
			report := h.inspectUndo(j.ID)
			blocked := scenario == "error-result" || scenario == "out-of-order" || scenario == "changed-done" || scenario == "changed-pending" || scenario == "corrupt"
			if blocked {
				if report.Eligible {
					t.Fatal(report)
				}
				if _, err := h.resumeUndo(j.ID); err == nil {
					t.Fatal("unsafe recovery allowed")
				}
				if _, err := os.Stat(filepath.Join(dir, "00000000-end.json")); !os.IsNotExist(err) {
					t.Fatal("blocked recovery finalized")
				}
				return
			}
			if !report.Eligible || !report.Resume {
				t.Fatal(report)
			}
			if (scenario == "prefix" || scenario == "move-prefix") && (report.Completed != 1 || report.Count != 1) {
				t.Fatal(report)
			}
			if _, err := h.resumeUndo(j.ID); err != nil {
				t.Fatal(err)
			}
			if report := h.inspectUndo(j.ID); !report.Undone {
				t.Fatal(report)
			}
			if _, err := h.resumeUndo(j.ID); err == nil {
				t.Fatal("recovery replayed")
			}
			data, _ := os.ReadFile(filepath.Join(src, "a.txt"))
			if string(data) != "a" {
				t.Fatal("source lost")
			}
			if scenario == "replace" {
				data, _ := os.ReadFile(filepath.Join(dst, "a.txt"))
				if string(data) != "old a" {
					t.Fatal("old destination lost")
				}
			}
		})
	}
}

func TestUndoReconciliation(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows recovery")
	}
	for _, scenario := range []string{"copy", "move", "tree", "replace", "not-moved", "both-present", "changed", "stale-preview", "directory", "record-missing", "restart"} {
		t.Run(scenario, func(t *testing.T) {
			j := transactionalJob(t)
			root := t.TempDir()
			src, dst := filepath.Join(root, "src"), filepath.Join(root, "dst")
			for _, p := range []string{src, dst} {
				if err := os.Mkdir(p, 0700); err != nil {
					t.Fatal(err)
				}
			}
			file := filepath.Join(src, "a.txt")
			put(t, file, "proof")
			p := Payload{Paths: []string{file}, Destination: dst, Mode: "copy", Conflict: "rename"}
			if scenario == "move" {
				p.Mode = "move"
			}
			if scenario == "tree" || scenario == "directory" {
				p.Paths = []string{src}
			}
			if scenario == "directory" {
				p.Mode, p.Merge = "move", true
				if err := os.Mkdir(filepath.Join(dst, "src"), 0700); err != nil {
					t.Fatal(err)
				}
			}
			if scenario == "replace" {
				p.Conflict = "overwrite"
				put(t, filepath.Join(dst, "a.txt"), "old")
			}
			if _, err := j.transfer(p); err != nil {
				t.Fatal(err)
			}
			if _, err := j.host.undoCopy(j.ID); err != nil {
				t.Fatal(err)
			}
			dir, _ := j.host.transactionDir(j.ID)
			dir = filepath.Join(dir, "undo")
			name := "00000001"
			if scenario == "replace" {
				name = "00000002"
			}
			event, err := readTransactionEvent(dir, name+"-result.json")
			if err != nil {
				t.Fatal(err)
			}
			intentBefore, err := os.ReadFile(filepath.Join(dir, name+"-intent.json"))
			if err != nil {
				t.Fatal(err)
			}
			for _, n := range []string{"00000000-end.json", name + "-result.json"} {
				if err := os.Remove(filepath.Join(dir, n)); err != nil {
					t.Fatal(err)
				}
			}
			switch scenario {
			case "not-moved":
				if _, err := restoreTrash(event.TrashRecord); err != nil {
					t.Fatal(err)
				}
			case "both-present":
				put(t, event.Source, "proof")
			case "changed":
				put(t, event.Destination, "changed")
			case "record-missing":
				if err := os.Remove(event.TrashRecord); err != nil {
					t.Fatal(err)
				}
			}
			h := newHost(io.Discard)
			h.journalDir = j.host.journalDir
			report := h.inspectUndo(j.ID)
			blocked := scenario == "not-moved" || scenario == "both-present" || scenario == "changed" || scenario == "directory" || scenario == "record-missing"
			if report.Eligible == blocked {
				t.Fatal(report)
			}
			if !blocked && (report.Reconciled != 1 || report.Count != 0) {
				t.Fatal(report)
			}
			if _, err := os.Stat(filepath.Join(dir, name+"-reconciled.json")); !os.IsNotExist(err) {
				t.Fatal("preview wrote evidence")
			}
			if scenario == "stale-preview" {
				put(t, event.Destination, "changed")
				blocked = true
			}
			if scenario == "restart" {
				// Simulate a crash after the durable reconciliation but before end.
				if err := writeTransactionEvent(dir, report.reconciliations[0]); err != nil {
					t.Fatal(err)
				}
				h = newHost(io.Discard)
				h.journalDir = j.host.journalDir
				if report = h.inspectUndo(j.ID); !report.Eligible || report.Reconciled != 0 {
					t.Fatal(report)
				}
			}
			_, err = h.resumeUndo(j.ID)
			if (err != nil) != blocked {
				t.Fatal("unexpected resume", err)
			}
			if !blocked {
				verified, err := readTransactionEvent(dir, name+"-reconciled.json")
				if err != nil || verified.Phase != "reconciled" || verified.Action != event.Action {
					t.Fatal(verified, err)
				}
				if !h.inspectUndo(j.ID).Undone {
					t.Fatal("not finalized")
				}
			} else {
				rows, _ := os.ReadDir(dir)
				for _, row := range rows {
					if strings.Contains(row.Name(), "reconciled") || row.Name() == "00000000-end.json" {
						t.Fatal("blocked recovery wrote evidence")
					}
				}
			}
			intentAfter, _ := os.ReadFile(filepath.Join(dir, name+"-intent.json"))
			if string(intentAfter) != string(intentBefore) {
				t.Fatal("original evidence changed")
			}
			if _, err := os.Stat(filepath.Join(dir, name+"-result.json")); !os.IsNotExist(err) {
				t.Fatal("invented original result")
			}
		})
	}
}

func TestUndoRecoveryLock(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows lock")
	}
	j, _, _ := undoFixture(t)
	unlock, err := j.host.lockUndo(j.ID)
	if err != nil {
		t.Fatal(err)
	}
	h := newHost(io.Discard)
	h.journalDir = j.host.journalDir
	if other, err := h.lockUndo(j.ID); err == nil {
		other()
		unlock()
		t.Fatal("second companion acquired active undo")
	}
	if report := h.inspectUndo(j.ID); report.Eligible {
		unlock()
		t.Fatal(report)
	}
	unlock()
	other, err := h.lockUndo(j.ID)
	if err != nil {
		t.Fatal(err)
	}
	other()
}
