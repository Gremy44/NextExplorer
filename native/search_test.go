package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSearchMetadataBatch(t *testing.T) {
	path := filepath.Join(t.TempDir(), "document.txt")
	put(t, path, "before")
	entry, err := statEntry(path)
	if err != nil {
		t.Fatal(err)
	}
	current := func(entries []Entry) bool {
		t.Helper()
		value, err := checkEntries(entries)
		if err != nil {
			t.Fatal(err)
		}
		return value.(M)["current"].(bool)
	}
	if !current([]Entry{entry}) {
		t.Fatal("unchanged file rejected")
	}
	wrongStamp := entry
	wrongStamp.Stamp += "1"
	if current([]Entry{wrongStamp}) {
		t.Fatal("precise modification time ignored")
	}
	put(t, path, "different length")
	if current([]Entry{entry}) {
		t.Fatal("changed file accepted")
	}
	os.Remove(path)
	if current([]Entry{entry}) {
		t.Fatal("deleted file accepted")
	}
	for _, entries := range [][]Entry{nil, make([]Entry, 101)} {
		if _, err := checkEntries(entries); err == nil {
			t.Fatal("unbounded batch accepted")
		}
	}
}
