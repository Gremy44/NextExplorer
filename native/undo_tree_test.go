package main

import (
	"io"
	"os"
	"path/filepath"
	"testing"
)

func undoTreeFixture(t *testing.T, merge bool) (*Job, string, string) {
	t.Helper()
	j := transactionalJob(t)
	root := t.TempDir()
	src := filepath.Join(root, "source", "folder")
	parent := filepath.Join(root, "target")
	dst := filepath.Join(parent, "folder")
	for _, p := range []string{filepath.Join(src, "nested", "empty"), parent} {
		if err := os.MkdirAll(p, 0700); err != nil {
			t.Fatal(err)
		}
	}
	put(t, filepath.Join(src, "nested", "file.txt"), "nested content")
	put(t, filepath.Join(src, "top.txt"), "top content")
	if merge {
		if err := os.Mkdir(dst, 0700); err != nil {
			t.Fatal(err)
		}
		put(t, filepath.Join(dst, "keep.txt"), "existing")
		put(t, filepath.Join(src, "keep.txt"), "skipped")
	}
	if _, err := j.transfer(Payload{Paths: []string{src}, Destination: parent, Mode: "copy", Conflict: "skip", Merge: merge}); err != nil {
		t.Fatal(err)
	}
	return j, src, dst
}

func TestUndoDirectoryCopyAndRestoreAfterRestart(t *testing.T) {
	j, src, dst := undoTreeFixture(t, false)
	h := newHost(io.Discard)
	h.journalDir = j.host.journalDir
	report, _ := h.undoPlan(j.ID)
	if !report.Eligible || report.Count != 1 || report.Paths[0] != dst {
		t.Fatal(report)
	}
	if _, err := h.undoCopy(j.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(dst); !os.IsNotExist(err) {
		t.Fatal("destination remains", err)
	}
	data, err := os.ReadFile(filepath.Join(src, "nested", "file.txt"))
	if err != nil || string(data) != "nested content" {
		t.Fatal(err)
	}
	dir, _ := h.transactionDir(j.ID)
	event, err := readTransactionEvent(filepath.Join(dir, "undo"), "00000001-result.json")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := restoreTrash(event.TrashRecord); err != nil {
		t.Fatal(err)
	}
	data, err = os.ReadFile(filepath.Join(dst, "nested", "file.txt"))
	if err != nil || string(data) != "nested content" {
		t.Fatal(err)
	}
	if info, err := os.Stat(filepath.Join(dst, "nested", "empty")); err != nil || !info.IsDir() {
		t.Fatal("empty folder lost", err)
	}
	if _, err := h.undoCopy(j.ID); err == nil {
		t.Fatal("replayed directory undo")
	}
}

func TestUndoMergePreservesExistingDirectoryAndSkippedFiles(t *testing.T) {
	j, _, dst := undoTreeFixture(t, true)
	report, _ := j.host.undoPlan(j.ID)
	if !report.Eligible || report.Count != 2 {
		t.Fatal(report)
	}
	if _, err := j.host.undoCopy(j.ID); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(dst, "keep.txt"))
	if err != nil || string(data) != "existing" {
		t.Fatal(err)
	}
	for _, p := range []string{"nested", "top.txt"} {
		if _, err := os.Stat(filepath.Join(dst, p)); !os.IsNotExist(err) {
			t.Fatal(p, err)
		}
	}
	if info, err := os.Stat(dst); err != nil || !info.IsDir() {
		t.Fatal("existing merge directory removed", err)
	}
}

func TestUndoDirectoryRefusesChangedTrees(t *testing.T) {
	for _, scenario := range []string{"added-file", "added-empty-directory", "modified", "missing", "missing-empty-directory", "source-missing", "hardlink", "symlink", "after-preview"} {
		t.Run(scenario, func(t *testing.T) {
			j, src, dst := undoTreeFixture(t, false)
			if report, _ := j.host.undoPlan(j.ID); !report.Eligible {
				t.Fatal(report)
			}
			switch scenario {
			case "added-file", "after-preview":
				put(t, filepath.Join(dst, "personal.txt"), "new data")
			case "added-empty-directory":
				if err := os.Mkdir(filepath.Join(dst, "personal"), 0700); err != nil {
					t.Fatal(err)
				}
			case "modified":
				put(t, filepath.Join(dst, "nested", "file.txt"), "edited")
			case "missing":
				if err := os.Remove(filepath.Join(dst, "top.txt")); err != nil {
					t.Fatal(err)
				}
			case "missing-empty-directory":
				if err := os.Remove(filepath.Join(dst, "nested", "empty")); err != nil {
					t.Fatal(err)
				}
			case "source-missing":
				if err := os.Remove(filepath.Join(src, "top.txt")); err != nil {
					t.Fatal(err)
				}
			case "hardlink", "symlink":
				p := filepath.Join(dst, "top.txt")
				if err := os.Remove(p); err != nil {
					t.Fatal(err)
				}
				var err error
				if scenario == "hardlink" {
					err = os.Link(filepath.Join(src, "top.txt"), p)
				} else {
					err = os.Symlink(filepath.Join(src, "top.txt"), p)
				}
				if err != nil {
					t.Skip(err)
				}
			}
			if _, err := j.host.undoCopy(j.ID); err == nil {
				t.Fatal("changed tree accepted")
			}
			if _, err := os.Stat(dst); err != nil {
				t.Fatal("tree moved despite refusal", err)
			}
			dir, _ := j.host.transactionDir(j.ID)
			if _, err := os.Stat(filepath.Join(dir, "undo")); !os.IsNotExist(err) {
				t.Fatal("preflight claimed undo", err)
			}
		})
	}
}

func TestUndoEmptyDirectory(t *testing.T) {
	j := transactionalJob(t)
	root := t.TempDir()
	src, dst := filepath.Join(root, "empty"), filepath.Join(root, "dest")
	for _, p := range []string{src, dst} {
		if err := os.Mkdir(p, 0700); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := j.transfer(Payload{Paths: []string{src}, Destination: dst, Mode: "copy", Conflict: "rename"}); err != nil {
		t.Fatal(err)
	}
	if _, err := j.host.undoCopy(j.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dst, "empty")); !os.IsNotExist(err) {
		t.Fatal(err)
	}
}
