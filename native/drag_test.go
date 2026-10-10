package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDragPaths(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "pièce.txt")
	if err := os.WriteFile(file, []byte("original"), 0600); err != nil {
		t.Fatal(err)
	}
	paths, err := dragPaths([]string{file, file})
	if err != nil || len(paths) != 1 {
		t.Fatalf("duplicates: %v %v", paths, err)
	}
	for _, input := range [][]string{nil, {dir}, {filepath.Join(dir, "absent")}, {"relative.txt"}, make([]string, 101)} {
		if _, err := dragPaths(input); err == nil {
			t.Fatalf("invalid selection accepted: %v", input)
		}
	}
	bytes, err := os.ReadFile(file)
	if err != nil || string(bytes) != "original" {
		t.Fatal("source modified")
	}
}
