package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestSpacePagesAndEmptyFolders(t *testing.T) {
	dir := t.TempDir()
	for i := 0; i < 2105; i++ {
		put(t, filepath.Join(dir, fmt.Sprintf("%04d.txt", i)), "abc")
	}
	if err := os.Mkdir(filepath.Join(dir, "empty"), 0700); err != nil {
		t.Fatal(err)
	}
	trash := filepath.Join(dir, ".nextexplorer-trash")
	if err := os.Mkdir(trash, 0700); err != nil {
		t.Fatal(err)
	}
	put(t, filepath.Join(trash, "old.txt"), "12345")
	j := jobForTest()
	defer j.cancel()
	value, err := j.scanSpace(dir)
	if err != nil {
		t.Fatal(err)
	}
	result := value.(*spaceResult)
	if result.Truncated || len(result.Items) != 2107 || result.Total != 6320 {
		t.Fatalf("incomplete scan: %+v", result)
	}
	// Durable reloads decode results into maps rather than the original Go type.
	encoded, _ := json.Marshal(result)
	var restored any
	if err := json.Unmarshal(encoded, &restored); err != nil {
		t.Fatal(err)
	}
	for _, source := range []any{result, restored} {
		offset := 0
		for {
			value, err := spaceResultPage(source, offset, 500)
			if err != nil {
				t.Fatal(err)
			}
			page := value.(M)
			data, _ := json.Marshal(page)
			if len(data) >= maxFrame {
				t.Fatal("oversized native frame")
			}
			items := page["items"].([]spaceItem)
			for i, item := range items {
				if item != result.Items[offset+i] {
					t.Fatal("page changed")
				}
			}
			offset += len(items)
			if _, more := page["nextOffset"]; !more {
				break
			}
			if page["nextOffset"] != offset {
				t.Fatal("invalid next offset")
			}
		}
		if offset != len(result.Items) {
			t.Fatal("missing scan rows")
		}
	}
	if _, err := spaceResultPage(result, -1, 500); err == nil {
		t.Fatal("negative offset accepted")
	}
}

func TestSpaceDoesNotHoldMutationLock(t *testing.T) {
	j := jobForTest()
	defer j.cancel()
	j.Kind = "scan"
	j.payload.Path = t.TempDir()
	h := j.host
	h.mutateMu.Lock()
	done := make(chan struct{})
	go func() { h.executeJob(j); close(done) }()
	select {
	case <-done:
		h.mutateMu.Unlock()
	case <-time.After(3 * time.Second):
		j.cancel()
		h.mutateMu.Unlock()
		<-done
		t.Fatal("read-only disk scan blocked behind mutations")
	}
	if j.State != "completed" {
		t.Fatal(j.Error)
	}
}

func TestSpaceResultLargerThanTaskRecordSurvivesReload(t *testing.T) {
	j := jobForTest()
	defer j.cancel()
	j.host.durableDir = t.TempDir()
	j.ID = "job-" + strings.Repeat("a", 32)
	j.Kind, j.State = "scan", "completed"
	result := &spaceResult{Path: "C:/", Items: []spaceItem{}}
	for i := 0; i < 20000; i++ {
		result.Items = append(result.Items, spaceItem{Path: "C:/" + strings.Repeat("x", 250) + fmt.Sprintf("/%05d.txt", i), Size: 1})
		result.Total++
	}
	cache := filepath.Join(j.host.durableDir, j.ID+".space")
	if err := atomicJSON(cache, result, 64<<20); err != nil {
		t.Fatal(err)
	}
	info, _ := os.Stat(cache)
	if info.Size() <= durableBytes {
		t.Fatal("test needs a result larger than the task record")
	}
	j.Result = result
	if err := j.saveDurable(); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(j.host.durableDir, j.ID+".json"))
	if err != nil || len(data) > 4096 {
		t.Fatal("full result leaked into task metadata", err)
	}
	var record taskRecord
	if err := json.Unmarshal(data, &record); err != nil {
		t.Fatal(err)
	}
	restored, err := loadSpaceResult(record.Result, cache)
	if err != nil {
		t.Fatal(err)
	}
	if len(restored.Items) != 20000 || restored.Total != 20000 {
		t.Fatal("results lost after reload")
	}
}
