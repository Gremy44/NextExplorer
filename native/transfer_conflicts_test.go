package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestTransferPreflightPreservesEarlierSources(t *testing.T) {
	for _, scenario := range []string{"directory", "self", "duplicate", "nested", "same-name"} {
		t.Run(scenario, func(t *testing.T) {
			root := t.TempDir()
			src, dst := filepath.Join(root, "src"), filepath.Join(root, "dst")
			os.Mkdir(src, 0700)
			os.Mkdir(dst, 0700)
			first := filepath.Join(src, "first.txt")
			put(t, first, "keep")
			paths := []string{first}
			switch scenario {
			case "directory":
				folder := filepath.Join(src, "folder")
				os.Mkdir(folder, 0700)
				os.Mkdir(filepath.Join(dst, "folder"), 0700)
				paths = append(paths, folder)
			case "self":
				own := filepath.Join(dst, "own.txt")
				put(t, own, "own")
				paths = append(paths, own)
			case "duplicate":
				paths = append(paths, first)
			case "nested":
				paths = append(paths, src)
			case "same-name":
				other := filepath.Join(root, "other")
				os.Mkdir(other, 0700)
				second := filepath.Join(other, "first.txt")
				put(t, second, "second")
				paths = append(paths, second)
			}
			_, err := jobForTest().transfer(Payload{Paths: paths, Destination: dst, Mode: "move", Conflict: "overwrite"})
			if err == nil {
				t.Fatal("conflict accepted")
			}
			data, err := os.ReadFile(first)
			if err != nil || string(data) != "keep" {
				t.Fatal("earlier source modified", err)
			}
			if _, err := os.Stat(filepath.Join(dst, "first.txt")); !os.IsNotExist(err) {
				t.Fatal("partial batch executed")
			}
		})
	}
}

func TestTransferSkipAndKeepBothInBatch(t *testing.T) {
	for _, policy := range []string{"skip", "rename"} {
		t.Run(policy, func(t *testing.T) {
			root := t.TempDir()
			dst := filepath.Join(root, "dst")
			os.Mkdir(dst, 0700)
			paths := []string{}
			for _, name := range []string{"a", "b"} {
				dir := filepath.Join(root, name)
				os.Mkdir(dir, 0700)
				file := filepath.Join(dir, "same.txt")
				put(t, file, name)
				paths = append(paths, file)
			}
			put(t, filepath.Join(dst, "same.txt"), "original")
			_, err := jobForTest().transfer(Payload{Paths: paths, Destination: dst, Mode: "move", Conflict: policy})
			if err != nil {
				t.Fatal(err)
			}
			data, _ := os.ReadFile(filepath.Join(dst, "same.txt"))
			if string(data) != "original" {
				t.Fatal("original overwritten")
			}
			for i, source := range paths {
				if policy == "skip" {
					if _, err := os.Stat(source); err != nil {
						t.Fatal("skipped source lost", err)
					}
				} else {
					target := "same (1).txt"
					expected := "a"
					if i == 1 {
						target = "same (2).txt"
						expected = "b"
					}
					data, err := os.ReadFile(filepath.Join(dst, target))
					if err != nil || string(data) != expected {
						t.Fatal("renamed content missing", err)
					}
					if _, err := os.Stat(source); !os.IsNotExist(err) {
						t.Fatal("move source remains")
					}
				}
			}
		})
	}
}
