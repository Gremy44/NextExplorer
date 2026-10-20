package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestAdvancedArchivesPasswordsAndSnapshot(t *testing.T) {
	cwd, _ := os.Getwd()
	t.Setenv("PATH", filepath.Join(cwd, "tools")+string(os.PathListSeparator)+os.Getenv("PATH"))
	if _, err := toolPath("7z"); err != nil {
		t.Skip(err)
	}
	for _, format := range []string{"7z", "zip"} {
		t.Run(format, func(t *testing.T) {
			source := filepath.Join(t.TempDir(), "secret.txt")
			put(t, source, "original content")
			dest := t.TempDir()
			j := jobForTest()
			password := "private-password-123"
			result, err := j.zip(Payload{Paths: []string{source}, Destination: dest, Name: "secret." + format, ArchiveFormat: format, Password: password})
			if err != nil {
				t.Fatal(err)
			}
			archive := result.(M)["path"].(string)
			result, err = j.extract(Payload{Paths: []string{archive}, Destination: dest, Name: "opened", Conflict: "error", Password: password})
			if err != nil {
				t.Fatal(err)
			}
			data, err := os.ReadFile(filepath.Join(dest, "opened", "secret.txt"))
			if err != nil || string(data) != "original content" {
				t.Fatal(string(data), err)
			}
			if _, err = j.extract(Payload{Paths: []string{archive}, Destination: dest, Name: "wrong", Conflict: "error", Password: "wrong"}); err == nil {
				t.Fatal("wrong password accepted")
			}
			if _, err = os.Stat(filepath.Join(dest, "wrong")); !os.IsNotExist(err) {
				t.Fatal("failed extraction published")
			}
			if data, _ := os.ReadFile(source); string(data) != "original content" {
				t.Fatal("source changed")
			}
		})
	}
}
