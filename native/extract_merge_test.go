package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestExtractMergePolicies(t *testing.T) {
	for _, policy := range []string{"rename", "skip", "overwrite"} {
		t.Run(policy, func(t *testing.T) {
			dir, archive := makeExtractZip(t, []string{"nested/same.txt", "fresh.txt", "empty/"}, false)
			original, _ := os.ReadFile(archive)
			os.MkdirAll(filepath.Join(dir, "nested"), 0700)
			put(t, filepath.Join(dir, "nested", "same.txt"), "old")
			put(t, filepath.Join(dir, "keep.txt"), "untouched")
			j := jobForTest()
			j.Kind = "extract"
			result, err := j.extract(Payload{Paths: []string{archive}, Destination: dir, Merge: true, Conflict: policy})
			if err != nil {
				t.Fatal(err)
			}
			if result.(M)["merged"] != true {
				t.Fatal(result)
			}
			want := "old"
			if policy == "overwrite" {
				want = "content"
			}
			data, _ := os.ReadFile(filepath.Join(dir, "nested", "same.txt"))
			if string(data) != want {
				t.Fatal(string(data))
			}
			if policy == "rename" {
				data, err := os.ReadFile(filepath.Join(dir, "nested", "same (1).txt"))
				if err != nil || string(data) != "content" {
					t.Fatal(err)
				}
			}
			if policy == "overwrite" {
				records, _ := filepath.Glob(filepath.Join(dir, "nested", ".nextexplorer-trash", "*.json"))
				if len(records) != 1 {
					t.Fatal("missing trash record", records)
				}
			}
			data, _ = os.ReadFile(filepath.Join(dir, "fresh.txt"))
			if string(data) != "content" {
				t.Fatal("missing fresh file")
			}
			data, _ = os.ReadFile(filepath.Join(dir, "keep.txt"))
			if string(data) != "untouched" {
				t.Fatal("unrelated file changed")
			}
			after, _ := os.ReadFile(archive)
			if !bytes.Equal(original, after) {
				t.Fatal("source archive changed")
			}
			expectedCopied := 2
			if policy == "skip" {
				expectedCopied = 1
				if j.Audit.Skipped != 1 {
					t.Fatal(j.Audit)
				}
			}
			if j.Audit.Copied != expectedCopied {
				t.Fatal(j.Audit)
			}
			for _, entry := range j.Audit.Entries {
				if !strings.HasPrefix(entry.Source, archive+" › ") {
					t.Fatal("temporary path exposed", entry)
				}
			}
		})
	}
}
func TestExtractMergeFailsBeforeChangingDestination(t *testing.T) {
	for _, scenario := range []string{"type-conflict", "corruption", "source", "hardlink-source", "cancel"} {
		t.Run(scenario, func(t *testing.T) {
			names := []string{"a-first.txt", "z-last.txt"}
			if scenario == "source" {
				names[1] = "sample.zip"
			}
			if scenario == "hardlink-source" {
				names[1] = "alias.zip"
			}
			dir, archive := makeExtractZip(t, names, false)
			put(t, filepath.Join(dir, "a-first.txt"), "old")
			if scenario == "type-conflict" {
				os.Mkdir(filepath.Join(dir, "z-last.txt"), 0700)
			}
			if scenario == "hardlink-source" {
				if err := os.Link(archive, filepath.Join(dir, "alias.zip")); err != nil {
					t.Skip(err)
				}
			}
			if scenario == "corruption" {
				data, _ := os.ReadFile(archive)
				i := bytes.Index(data, []byte("content"))
				data[i] = 'X'
				os.WriteFile(archive, data, 0600)
			}
			original, _ := os.ReadFile(archive)
			j := jobForTest()
			if scenario == "cancel" {
				j.cancel()
			}
			_, err := j.extract(Payload{Paths: []string{archive}, Destination: dir, Merge: true, Conflict: "overwrite"})
			if err == nil {
				t.Fatal("expected refusal")
			}
			data, _ := os.ReadFile(filepath.Join(dir, "a-first.txt"))
			if string(data) != "old" {
				t.Fatal("destination changed before validation")
			}
			after, _ := os.ReadFile(archive)
			if !bytes.Equal(original, after) {
				t.Fatal("source changed")
			}
			rows, _ := os.ReadDir(dir)
			for _, row := range rows {
				if strings.HasPrefix(row.Name(), ".nextexplorer-") {
					t.Fatal("temporary folder left", row.Name())
				}
			}
		})
	}
}
