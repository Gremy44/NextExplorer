package main

import (
	"bytes"
	"fmt"
	"path/filepath"
	"testing"
)

func TestListingSnapshotSurvivesDirectoryChanges(t *testing.T) {
	dir := t.TempDir()
	for i := 0; i < 520; i++ {
		put(t, filepath.Join(dir, fmt.Sprintf("%04d.txt", i)), "x")
	}
	h := newHost(&bytes.Buffer{})
	r, e := h.list(Payload{Path: dir, Limit: 500})
	if e != nil {
		t.Fatal(e)
	}
	first := r.(M)
	if len(first["entries"].([]Entry)) != 500 {
		t.Fatal("pagination")
	}
	put(t, filepath.Join(dir, "0000-new.txt"), "new")
	r, e = h.list(Payload{Path: dir, Offset: 500, Snapshot: first["snapshot"].(string)})
	if e != nil {
		t.Fatal(e)
	}
	last := r.(M)
	if last["total"] != 520 || len(last["entries"].([]Entry)) != 20 || last["entries"].([]Entry)[0].Name != "0500.txt" {
		t.Fatal("unstable snapshot", last)
	}
}
