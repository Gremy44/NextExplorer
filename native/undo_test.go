package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func undoFixture(t *testing.T) (*Job, string, string) {
	t.Helper()
	j := transactionalJob(t)
	root := t.TempDir()
	src, dst := filepath.Join(root, "src"), filepath.Join(root, "dst")
	if err := os.Mkdir(src, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(dst, 0700); err != nil {
		t.Fatal(err)
	}
	put(t, filepath.Join(src, "file.txt"), "original")
	_, err := j.transfer(Payload{Paths: []string{filepath.Join(src, "file.txt")}, Destination: dst, Mode: "copy", Conflict: "rename"})
	if err != nil {
		t.Fatal(err)
	}
	return j, filepath.Join(src, "file.txt"), filepath.Join(dst, "file.txt")
}

func TestUndoCopyAfterRestartAndRestore(t *testing.T) {
	j, src, dst := undoFixture(t)
	h := newHost(io.Discard)
	h.journalDir = j.host.journalDir
	report, _ := h.undoPlan(j.ID)
	if !report.Eligible || report.Count != 1 {
		t.Fatal(report)
	}
	if _, err := h.undoCopy(j.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(dst); !os.IsNotExist(err) {
		t.Fatal("copy remains", err)
	}
	data, err := os.ReadFile(src)
	if err != nil || string(data) != "original" {
		t.Fatal(err)
	}
	dir, _ := h.transactionDir(j.ID)
	event, err := readTransactionEvent(filepath.Join(dir, "undo"), "00000001-result.json")
	if err != nil || event.TrashRecord == "" || event.Error != "" {
		t.Fatal(event, err)
	}
	report, _ = h.undoPlan(j.ID)
	if !report.Undone || report.Eligible {
		t.Fatal(report)
	}
	if _, err = h.undoCopy(j.ID); err == nil {
		t.Fatal("repeated undo allowed")
	}
	if _, err = restoreTrash(event.TrashRecord); err != nil {
		t.Fatal(err)
	}
	data, err = os.ReadFile(dst)
	if err != nil || string(data) != "original" {
		t.Fatal(err)
	}
}

func TestUndoRefusesChangedFilesAndBadEvidence(t *testing.T) {
	for _, scenario := range []string{"destination", "source", "missing", "intent", "corrupt", "mismatch", "unknown", "interrupted", "claim", "link"} {
		t.Run(scenario, func(t *testing.T) {
			j, src, dst := undoFixture(t)
			dir, _ := j.host.transactionDir(j.ID)
			switch scenario {
			case "destination":
				put(t, dst, "changed")
			case "source":
				put(t, src, "changed")
			case "missing":
				os.Remove(src)
			case "intent":
				os.Remove(filepath.Join(dir, "00000001-result.json"))
			case "corrupt":
				put(t, filepath.Join(dir, "00000001-result.json"), "{")
			case "mismatch":
				event, _ := readTransactionEvent(dir, "00000001-result.json")
				event.Source = dst
				data, _ := json.Marshal(event)
				os.WriteFile(filepath.Join(dir, "00000001-result.json"), data, 0600)
			case "unknown":
				event, _ := readTransactionEvent(dir, "00000001-result.json")
				event.Version = 99
				data, _ := json.Marshal(event)
				os.WriteFile(filepath.Join(dir, "00000001-result.json"), data, 0600)
			case "interrupted":
				os.Remove(filepath.Join(dir, "00000000-end.json"))
			case "claim":
				os.Mkdir(filepath.Join(dir, "undo"), 0700)
			case "link":
				os.Remove(dst)
				if err := os.Link(src, dst); err != nil {
					t.Skip(err)
				}
			}
			report, _ := j.host.undoPlan(j.ID)
			if report.Eligible || report.Reason == "" {
				t.Fatal(report)
			}
			if _, err := j.host.undoCopy(j.ID); err == nil {
				t.Fatal("unsafe undo allowed")
			}
			if _, err := os.Stat(dst); err != nil {
				t.Fatal("destination modified", err)
			}
		})
	}
}

func TestUndoRechecksAfterPreview(t *testing.T) {
	j, _, dst := undoFixture(t)
	report, _ := j.host.undoPlan(j.ID)
	if !report.Eligible {
		t.Fatal(report)
	}
	put(t, dst, "edited after preview")
	if _, err := j.host.undoCopy(j.ID); err == nil {
		t.Fatal("stale preview accepted")
	}
	data, _ := os.ReadFile(dst)
	if string(data) != "edited after preview" {
		t.Fatal(string(data))
	}
}

func TestUndoExplicitScopeAndWholeBatchPreflight(t *testing.T) {
	for _, scenario := range []string{"overwrite", "batch"} {
		t.Run(scenario, func(t *testing.T) {
			j := transactionalJob(t)
			root := t.TempDir()
			src, dst := filepath.Join(root, "src"), filepath.Join(root, "dst")
			os.Mkdir(src, 0700)
			os.Mkdir(dst, 0700)
			paths := []string{}
			for i := 0; i < 12; i++ {
				p := filepath.Join(src, fmt.Sprintf("%02d.txt", i))
				put(t, p, "original")
				paths = append(paths, p)
			}
			p := Payload{Paths: paths, Destination: dst, Mode: "copy", Conflict: "rename"}
			switch scenario {
			case "overwrite":
				p.Conflict = "overwrite"
				put(t, filepath.Join(dst, "00.txt"), "old")
			}
			if _, err := j.transfer(p); err != nil {
				t.Fatal(err)
			}
			if scenario == "batch" {
				put(t, filepath.Join(dst, "11.txt"), "changed")
			}
			if scenario == "overwrite" {
				dir, _ := j.host.transactionDir(j.ID)
				backup, err := readTransactionEvent(dir, "00000001-result.json")
				if err != nil {
					t.Fatal(err)
				}
				if err := os.Remove(backup.Destination); err != nil {
					t.Fatal(err)
				}
			}
			report, _ := j.host.undoPlan(j.ID)
			if report.Eligible {
				t.Fatal(report)
			}
			if _, err := j.host.undoCopy(j.ID); err == nil {
				t.Fatal("unsupported undo allowed")
			}
			if scenario == "batch" {
				if _, err := os.Stat(filepath.Join(dst, "00.txt")); err != nil {
					t.Fatal("batch partially changed", err)
				}
			}
		})
	}
}

func TestUndoRejectsTraversal(t *testing.T) {
	j := transactionalJob(t)
	for _, id := range []string{"..", `job-x/../../outside`, `job-x\..\outside`, "C:\\outside"} {
		if _, err := j.host.transactionDir(id); err == nil {
			t.Fatal(id)
		}
	}
}

func TestUndoAcrossVolumes(t *testing.T) {
	other := os.Getenv("NEXTEXPLORER_TEST_OTHER_VOLUME")
	if runtime.GOOS != "windows" || other == "" {
		t.Skip("set NEXTEXPLORER_TEST_OTHER_VOLUME to a test directory on another Windows volume")
	}
	for _, scenario := range []string{"file", "tree", "merge", "replace", "occupied", "changed", "journal-failure"} {
		t.Run(scenario, func(t *testing.T) {
			j := transactionalJob(t)
			root := t.TempDir()
			if strings.EqualFold(filepath.VolumeName(root), filepath.VolumeName(other)) {
				t.Fatal("test requires two different volumes")
			}
			dest, err := os.MkdirTemp(other, "undo-volumes-")
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() {
				if err := os.RemoveAll(dest); err != nil {
					t.Error(err)
				}
			})
			src := filepath.Join(root, "item")
			target := filepath.Join(dest, "item")
			isDir := scenario == "tree" || scenario == "merge"
			if isDir {
				if err := os.MkdirAll(filepath.Join(src, "empty"), 0700); err != nil {
					t.Fatal(err)
				}
				put(t, filepath.Join(src, "proof.txt"), "cross volume content")
			} else {
				put(t, src, "cross volume content")
			}
			if scenario == "merge" {
				if err := os.Mkdir(target, 0700); err != nil {
					t.Fatal(err)
				}
				put(t, filepath.Join(target, "existing.txt"), "keep")
			}
			conflict := "rename"
			if scenario == "replace" {
				conflict = "overwrite"
				put(t, target, "old target")
			}
			if _, err := j.transfer(Payload{Paths: []string{src}, Destination: dest, Mode: "move", Conflict: conflict, Merge: scenario == "merge"}); err != nil {
				t.Fatal(err)
			}
			h := newHost(io.Discard)
			h.journalDir = j.host.journalDir
			report, plan := h.undoPlan(j.ID)
			if !report.Eligible {
				t.Fatal(report)
			}
			switch scenario {
			case "occupied":
				put(t, src, "personal")
			case "changed":
				put(t, target, "edited")
			case "journal-failure":
				log := t.TempDir()
				put(t, filepath.Join(log, "transactions"), "blocked")
				if err := copyUndoMove(plan[0], log, 1); err == nil {
					t.Fatal("journal failure ignored")
				}
				if _, err := os.Stat(src); !os.IsNotExist(err) {
					t.Fatal("copy made without journal")
				}
				data, _ := os.ReadFile(target)
				if string(data) != "cross volume content" {
					t.Fatal("destination changed")
				}
				return
			}
			_, err = h.undoCopy(j.ID)
			if scenario == "occupied" || scenario == "changed" {
				if err == nil {
					t.Fatal("unsafe cross-volume undo")
				}
				if _, err := os.Stat(target); err != nil {
					t.Fatal("destination lost", err)
				}
				if scenario == "occupied" {
					data, _ := os.ReadFile(src)
					if string(data) != "personal" {
						t.Fatal("occupied source overwritten")
					}
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			proof := src
			if isDir {
				proof = filepath.Join(src, "proof.txt")
				if _, err := os.Stat(filepath.Join(src, "empty")); err != nil {
					t.Fatal(err)
				}
			}
			data, _ := os.ReadFile(proof)
			if string(data) != "cross volume content" {
				t.Fatal("return copy differs")
			}
			if scenario == "replace" {
				data, _ := os.ReadFile(target)
				if string(data) != "old target" {
					t.Fatal("old target lost")
				}
			} else if scenario == "merge" {
				data, _ := os.ReadFile(filepath.Join(target, "existing.txt"))
				if string(data) != "keep" {
					t.Fatal("existing merge target lost")
				}
				if _, err := os.Stat(filepath.Join(target, "proof.txt")); !os.IsNotExist(err) {
					t.Fatal("moved file remains", err)
				}
			} else if _, err := os.Stat(target); !os.IsNotExist(err) {
				t.Fatal("destination not retired", err)
			}
			dir, _ := h.transactionDir(j.ID)
			// A real native cross-volume refusal must have taken the copy-back path.
			logs, err := os.ReadDir(filepath.Join(dir, "undo", "transactions"))
			if err != nil || len(logs) == 0 {
				t.Fatal("copy-back journal missing", err)
			}
			retired := 0
			for _, log := range logs {
				files, err := os.ReadDir(filepath.Join(dir, "undo", "transactions", log.Name()))
				if err != nil {
					t.Fatal(err)
				}
				for _, file := range files {
					event, err := readTransactionEvent(filepath.Join(dir, "undo", "transactions", log.Name()), file.Name())
					if err != nil {
						t.Fatal(err)
					}
					if event.Action == "undo-retire" && event.Phase == "result" {
						if event.Error != "" {
							t.Fatal(event)
						}
						if _, err := os.Stat(event.Destination); err != nil {
							t.Fatal("safety copy missing", err)
						}
						if _, err := os.Stat(event.TrashRecord); err != nil {
							t.Fatal("safety recovery record missing", err)
						}
						retired++
					}
				}
			}
			if retired == 0 {
				t.Fatal("no safety copy recorded")
			}
			if _, err := h.undoCopy(j.ID); err == nil {
				t.Fatal("cross-volume undo replayed")
			}
			if err := os.Remove(filepath.Join(dir, "undo", "00000000-end.json")); err != nil {
				t.Fatal(err)
			}
			if report := h.inspectUndo(j.ID); !report.Eligible || !report.Resume || report.Count != 0 {
				t.Fatal(report)
			}
			rows, err := os.ReadDir(filepath.Join(dir, "undo"))
			if err != nil {
				t.Fatal(err)
			}
			for _, row := range rows {
				if row.IsDir() {
					continue
				}
				event, err := readTransactionEvent(filepath.Join(dir, "undo"), row.Name())
				if err != nil {
					t.Fatal(err)
				}
				if event.Action == "undo-move" && event.Phase == "result" {
					if err := os.Remove(filepath.Join(dir, "undo", row.Name())); err != nil {
						t.Fatal(err)
					}
				}
			}
			if report := h.inspectUndo(j.ID); !report.Eligible || report.Reconciled == 0 {
				t.Fatal(report)
			}
			if _, err := h.resumeUndo(j.ID); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestUndoMergedMoves(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows move undo")
	}
	for _, scenario := range []string{"nested", "skip", "overwrite", "empty", "recreated", "occupied-child", "edited", "missing-parent"} {
		t.Run(scenario, func(t *testing.T) {
			j := transactionalJob(t)
			root := t.TempDir()
			src := filepath.Join(root, "source", "folder")
			dst := filepath.Join(root, "target", "folder")
			for _, p := range []string{filepath.Join(src, "nested"), filepath.Join(dst, "nested")} {
				if err := os.MkdirAll(p, 0700); err != nil {
					t.Fatal(err)
				}
			}
			put(t, filepath.Join(dst, "existing.txt"), "keep")
			if scenario != "empty" {
				put(t, filepath.Join(src, "nested", "file.txt"), "moved")
				if err := os.Mkdir(filepath.Join(src, "new-empty"), 0700); err != nil {
					t.Fatal(err)
				}
			}
			conflict := "rename"
			if scenario == "skip" || scenario == "occupied-child" {
				conflict = "skip"
				put(t, filepath.Join(src, "keep.txt"), "source keep")
				put(t, filepath.Join(dst, "keep.txt"), "target keep")
			}
			if scenario == "overwrite" {
				conflict = "overwrite"
				put(t, filepath.Join(dst, "nested", "file.txt"), "old")
			}
			if _, err := j.transfer(Payload{Paths: []string{src}, Destination: filepath.Dir(dst), Mode: "move", Conflict: conflict, Merge: true}); err != nil {
				t.Fatal(err)
			}
			h := newHost(io.Discard)
			h.journalDir = j.host.journalDir
			report, _ := h.undoPlan(j.ID)
			if !report.Eligible || report.Directories == 0 {
				t.Fatal(report)
			}
			switch scenario {
			case "recreated":
				if err := os.Mkdir(src, 0700); err != nil {
					t.Fatal(err)
				}
				put(t, filepath.Join(src, "personal.txt"), "new")
			case "occupied-child":
				if err := os.Mkdir(filepath.Join(src, "nested"), 0700); err != nil {
					t.Fatal(err)
				}
			case "edited":
				put(t, filepath.Join(dst, "nested", "file.txt"), "edit")
			case "missing-parent":
				if err := os.Remove(filepath.Dir(src)); err != nil {
					t.Fatal(err)
				}
			}
			_, err := h.undoCopy(j.ID)
			if scenario == "recreated" || scenario == "occupied-child" || scenario == "edited" || scenario == "missing-parent" {
				if err == nil {
					t.Fatal("unsafe merge undo accepted")
				}
				if _, err := os.Stat(filepath.Join(dst, "nested", "file.txt")); err != nil {
					t.Fatal("moved file lost", err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if info, err := os.Stat(filepath.Join(src, "nested")); err != nil || !info.IsDir() {
				t.Fatal("source folder missing", err)
			}
			if scenario != "empty" {
				data, _ := os.ReadFile(filepath.Join(src, "nested", "file.txt"))
				if string(data) != "moved" {
					t.Fatal("file not returned")
				}
				if _, err := os.Stat(filepath.Join(src, "new-empty")); err != nil {
					t.Fatal("empty source not returned", err)
				}
			}
			data, _ := os.ReadFile(filepath.Join(dst, "existing.txt"))
			if string(data) != "keep" {
				t.Fatal("existing file lost")
			}
			if _, err := os.Stat(filepath.Join(dst, "nested")); err != nil {
				t.Fatal("existing directory removed", err)
			}
			if scenario == "skip" {
				data, _ := os.ReadFile(filepath.Join(src, "keep.txt"))
				if string(data) != "source keep" {
					t.Fatal("skipped source lost")
				}
				data, _ = os.ReadFile(filepath.Join(dst, "keep.txt"))
				if string(data) != "target keep" {
					t.Fatal("skipped target lost")
				}
			}
			if scenario == "overwrite" {
				data, _ := os.ReadFile(filepath.Join(dst, "nested", "file.txt"))
				if string(data) != "old" {
					t.Fatal("old target not restored")
				}
			}
			if _, err := h.undoCopy(j.ID); err == nil {
				t.Fatal("merge undo replayed")
			}
		})
	}
}

func TestUndoMoves(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows move undo")
	}
	for _, scenario := range []string{"file", "directory", "empty", "occupied", "changed", "added", "missing-parent", "rename", "bad-evidence", "no-replace"} {
		t.Run(scenario, func(t *testing.T) {
			j := transactionalJob(t)
			root := t.TempDir()
			srcParent, dstParent := filepath.Join(root, "src"), filepath.Join(root, "dst")
			for _, p := range []string{srcParent, dstParent} {
				if err := os.Mkdir(p, 0700); err != nil {
					t.Fatal(err)
				}
			}
			src := filepath.Join(srcParent, "item")
			dst := filepath.Join(dstParent, "item")
			isDir := scenario == "directory" || scenario == "empty" || scenario == "added"
			if isDir {
				if err := os.MkdirAll(filepath.Join(src, "empty"), 0700); err != nil {
					t.Fatal(err)
				}
				if scenario != "empty" {
					put(t, filepath.Join(src, "proof.txt"), "original")
				}
			} else {
				put(t, src, "original")
			}
			if scenario == "rename" {
				put(t, dst, "keep")
				dst = filepath.Join(dstParent, "item (1)")
			}
			if _, err := j.transfer(Payload{Paths: []string{src}, Destination: dstParent, Mode: "move", Conflict: "rename"}); err != nil {
				t.Fatal(err)
			}
			h := newHost(io.Discard)
			h.journalDir = j.host.journalDir
			report, _ := h.undoPlan(j.ID)
			if !report.Eligible || report.Mode != "move" || report.Count != 1 || report.Targets[0] != src {
				t.Fatal(report)
			}
			switch scenario {
			case "occupied":
				put(t, src, "personal")
			case "changed":
				put(t, dst, "edited")
			case "added":
				put(t, filepath.Join(dst, "personal.txt"), "personal")
			case "missing-parent":
				if err := os.Remove(srcParent); err != nil {
					t.Fatal(err)
				}
			case "bad-evidence":
				dir, _ := h.transactionDir(j.ID)
				for _, phase := range []string{"intent", "result"} {
					name := "00000002-" + phase + ".json"
					event, err := readTransactionEvent(dir, name)
					if err != nil {
						t.Fatal(err)
					}
					event.Hash = "inconsistent"
					data, _ := json.Marshal(event)
					if err := os.WriteFile(filepath.Join(dir, name), data, 0600); err != nil {
						t.Fatal(err)
					}
				}
			case "no-replace":
				put(t, src, "personal")
				if err := moveUndoEntry(dst, src); err == nil {
					t.Fatal("native rename overwrote existing file")
				}
			}
			_, err := h.undoCopy(j.ID)
			refused := scenario == "occupied" || scenario == "changed" || scenario == "added" || scenario == "missing-parent" || scenario == "bad-evidence" || scenario == "no-replace"
			if refused {
				if err == nil {
					t.Fatal("unsafe move accepted")
				}
				if _, err := os.Stat(dst); err != nil {
					t.Fatal("destination lost", err)
				}
				if scenario == "occupied" || scenario == "no-replace" {
					data, _ := os.ReadFile(src)
					if string(data) != "personal" {
						t.Fatal("occupied origin changed")
					}
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if _, err := os.Stat(dst); !os.IsNotExist(err) {
				t.Fatal("old destination remains", err)
			}
			if isDir {
				if _, err := os.Stat(filepath.Join(src, "empty")); err != nil {
					t.Fatal(err)
				}
				if scenario != "empty" {
					data, _ := os.ReadFile(filepath.Join(src, "proof.txt"))
					if string(data) != "original" {
						t.Fatal("content lost")
					}
				}
			} else {
				data, _ := os.ReadFile(src)
				if string(data) != "original" {
					t.Fatal("content lost")
				}
			}
			if scenario == "rename" {
				data, _ := os.ReadFile(filepath.Join(dstParent, "item"))
				if string(data) != "keep" {
					t.Fatal("collision changed")
				}
			}
			if _, err := h.undoCopy(j.ID); err == nil {
				t.Fatal("move undo replayed")
			}
			dir, _ := h.transactionDir(j.ID)
			event, err := readTransactionEvent(filepath.Join(dir, "undo"), "00000001-result.json")
			if err != nil || event.Action != "undo-move" || event.Error != "" {
				t.Fatal(event, err)
			}
		})
	}
}

func TestUndoReplacements(t *testing.T) {
	for _, mode := range []string{"copy", "move"} {
		if mode == "move" && runtime.GOOS != "windows" {
			continue
		}
		for _, scenario := range []string{"success", "changed-new", "changed-backup", "missing-backup", "bad-record", "missing-record", "interrupted", "occupied-restore", "failed-result"} {
			t.Run(mode+"/"+scenario, func(t *testing.T) {
				j := transactionalJob(t)
				root := t.TempDir()
				src, dst := filepath.Join(root, "src"), filepath.Join(root, "dst")
				if err := os.Mkdir(dst, 0700); err != nil {
					t.Fatal(err)
				}
				put(t, src, "new version")
				target := filepath.Join(dst, "src")
				put(t, target, "old version")
				if _, err := j.transfer(Payload{Paths: []string{src}, Destination: dst, Mode: mode, Conflict: "overwrite"}); err != nil {
					t.Fatal(err)
				}
				h := newHost(io.Discard)
				h.journalDir = j.host.journalDir
				dir, _ := h.transactionDir(j.ID)
				backup, err := readTransactionEvent(dir, "00000001-result.json")
				if err != nil {
					t.Fatal(err)
				}
				report, _ := h.undoPlan(j.ID)
				if !report.Eligible || report.Replacements != 1 {
					t.Fatal(report)
				}
				switch scenario {
				case "changed-new":
					put(t, target, "personal edit")
				case "changed-backup":
					put(t, backup.Destination, "changed old")
				case "missing-backup":
					if err := os.Remove(backup.Destination); err != nil {
						t.Fatal(err)
					}
				case "bad-record":
					put(t, backup.TrashRecord, `{"original":"elsewhere"}`)
				case "missing-record":
					if err := os.Remove(backup.TrashRecord); err != nil {
						t.Fatal(err)
					}
				case "interrupted":
					if err := os.Remove(filepath.Join(dir, "00000002-result.json")); err != nil {
						t.Fatal(err)
					}
				case "occupied-restore":
					if err := restoreUndoBackup(backup, t.TempDir(), 1); err == nil {
						t.Fatal("occupied target replaced")
					}
					data, _ := os.ReadFile(target)
					if string(data) != "new version" {
						t.Fatal("new version lost")
					}
					return
				case "failed-result":
					// Exercise the failure after restoration, without deleting either version.
					saved := filepath.Join(dst, "preserved-new")
					if err := publishFile(target, saved); err != nil {
						t.Fatal(err)
					}
					log := t.TempDir()
					if err := os.Mkdir(filepath.Join(log, "00000001-result.json"), 0700); err != nil {
						t.Fatal(err)
					}
					if err := restoreUndoBackup(backup, log, 1); err == nil {
						t.Fatal("journal failure hidden")
					}
					data, _ := os.ReadFile(target)
					if string(data) != "old version" {
						t.Fatal("old version lost")
					}
					data, _ = os.ReadFile(saved)
					if string(data) != "new version" {
						t.Fatal("new version lost")
					}
					return
				}
				_, err = h.undoCopy(j.ID)
				if scenario != "success" {
					if err == nil {
						t.Fatal("unsafe restoration allowed")
					}
					if _, err := os.Stat(target); err != nil {
						t.Fatal("preflight removed target", err)
					}
					return
				}
				if err != nil {
					t.Fatal(err)
				}
				data, _ := os.ReadFile(target)
				if string(data) != "old version" {
					t.Fatal("old version not restored")
				}
				data, _ = os.ReadFile(src)
				if string(data) != "new version" {
					t.Fatal("source lost")
				}
				if mode == "copy" {
					event, err := readTransactionEvent(filepath.Join(dir, "undo"), "00000001-result.json")
					if err != nil {
						t.Fatal(err)
					}
					data, _ := os.ReadFile(event.Destination)
					if string(data) != "new version" {
						t.Fatal("new copy not preserved")
					}
				}
				if _, err := h.undoCopy(j.ID); err == nil {
					t.Fatal("replacement undo replayed")
				}
			})
		}
	}
}
