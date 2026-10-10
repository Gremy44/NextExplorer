package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestMergePolicies(t *testing.T) {
	for _, mode := range []string{"copy", "move"} {
		for _, policy := range []string{"skip", "rename", "overwrite"} {
			t.Run(mode+"/"+policy, func(t *testing.T) {
				root := t.TempDir()
				src := filepath.Join(root, "src", "folder")
				dest := filepath.Join(root, "dst")
				target := filepath.Join(dest, "folder")
				os.MkdirAll(filepath.Join(src, "nested"), 0700)
				os.MkdirAll(filepath.Join(target, "nested"), 0700)
				put(t, filepath.Join(src, "nested", "same.txt"), "new")
				put(t, filepath.Join(src, "fresh.txt"), "fresh")
				put(t, filepath.Join(target, "nested", "same.txt"), "old")
				put(t, filepath.Join(target, "untouched.txt"), "untouched")
				_, err := jobForTest().transfer(Payload{Paths: []string{src}, Destination: dest, Mode: mode, Conflict: policy, Merge: true})
				if err != nil {
					t.Fatal(err)
				}
				check := func(path, want string) {
					t.Helper()
					data, err := os.ReadFile(path)
					if err != nil || string(data) != want {
						t.Fatalf("%s: %q, %v; want %q", path, data, err, want)
					}
				}
				check(filepath.Join(target, "fresh.txt"), "fresh")
				check(filepath.Join(target, "untouched.txt"), "untouched")
				want := "old"
				if policy == "overwrite" {
					want = "new"
				}
				check(filepath.Join(target, "nested", "same.txt"), want)
				if policy == "rename" {
					check(filepath.Join(target, "nested", "same (1).txt"), "new")
				}
				if mode == "copy" || policy == "skip" {
					check(filepath.Join(src, "nested", "same.txt"), "new")
				} else if _, err := os.Stat(src); !os.IsNotExist(err) {
					t.Fatal("empty source not removed")
				}
				if mode == "move" {
					if _, err := os.Stat(filepath.Join(src, "fresh.txt")); !os.IsNotExist(err) {
						t.Fatal("transferred source remains")
					}
				}
			})
		}
	}
}

func TestMergePreflightTypeConflict(t *testing.T) {
	root := t.TempDir()
	src := filepath.Join(root, "src", "folder")
	dest := filepath.Join(root, "dst")
	target := filepath.Join(dest, "folder")
	os.MkdirAll(src, 0700)
	os.MkdirAll(filepath.Join(target, "z-conflict"), 0700)
	put(t, filepath.Join(src, "a-first.txt"), "keep")
	put(t, filepath.Join(src, "z-conflict"), "file")
	_, err := jobForTest().transfer(Payload{Paths: []string{src}, Destination: dest, Mode: "move", Conflict: "overwrite", Merge: true})
	if err == nil {
		t.Fatal("file/directory replacement accepted")
	}
	if _, err := os.Stat(filepath.Join(src, "a-first.txt")); err != nil {
		t.Fatal("source moved before conflict detection")
	}
	if _, err := os.Stat(filepath.Join(target, "a-first.txt")); !os.IsNotExist(err) {
		t.Fatal("partial merge executed")
	}
}

func TestMergeEmptyDirectoryAndCancellation(t *testing.T) {
	for _, cancel := range []bool{false, true} {
		root := t.TempDir()
		src := filepath.Join(root, "src", "folder")
		dest := filepath.Join(root, "dst")
		os.MkdirAll(src, 0700)
		os.MkdirAll(filepath.Join(dest, "folder"), 0700)
		j := jobForTest()
		if cancel {
			j.cancel()
		}
		_, err := j.transfer(Payload{Paths: []string{src}, Destination: dest, Mode: "move", Conflict: "skip", Merge: true})
		if cancel {
			if err == nil {
				t.Fatal("cancel ignored")
			}
			if _, err := os.Stat(src); err != nil {
				t.Fatal("cancelled source removed")
			}
		} else {
			if err != nil {
				t.Fatal(err)
			}
			if _, err := os.Stat(src); !os.IsNotExist(err) {
				t.Fatal("empty source remains")
			}
		}
	}
}
