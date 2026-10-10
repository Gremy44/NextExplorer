package main

import (
	"archive/zip"
	"bytes"
	"encoding/binary"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func makeExtractZip(t *testing.T, names []string, symlink bool) (string, string) {
	t.Helper()
	if runtime.GOOS != "windows" {
		t.Skip("Windows publication")
	}
	dir := t.TempDir()
	file := filepath.Join(dir, "sample.zip")
	var b bytes.Buffer
	w := zip.NewWriter(&b)
	for _, name := range names {
		h := &zip.FileHeader{Name: name, Method: zip.Store}
		if symlink {
			h.SetMode(os.ModeSymlink | 0700)
		}
		out, err := w.CreateHeader(h)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.HasSuffix(name, "/") {
			out.Write([]byte("content"))
		}
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, b.Bytes(), 0600); err != nil {
		t.Fatal(err)
	}
	return dir, file
}
func extractionPayload(dir, file string) Payload {
	return Payload{Paths: []string{file}, Destination: dir, Name: "output", Conflict: "error"}
}
func noExtractOutput(t *testing.T, dir string) {
	t.Helper()
	rows, _ := os.ReadDir(dir)
	for _, row := range rows {
		if row.Name() != "sample.zip" {
			t.Fatalf("unexpected output: %s", row.Name())
		}
	}
}
func TestZipExtractionAndCollisions(t *testing.T) {
	dir, file := makeExtractZip(t, []string{"nested/", "nested/café.txt", "empty/"}, false)
	p := extractionPayload(dir, file)
	j := jobForTest()
	if _, err := j.extract(p); err != nil {
		t.Fatal(err)
	}
	content, err := os.ReadFile(filepath.Join(dir, "output", "nested", "café.txt"))
	if err != nil || string(content) != "content" {
		t.Fatal(err, string(content))
	}
	if j.Done != 7 {
		t.Fatal(j.Done)
	}
	if _, err := jobForTest().extract(p); err == nil {
		t.Fatal("existing destination accepted")
	}
	p.Conflict = "skip"
	result, err := jobForTest().extract(p)
	if err != nil || result.(M)["skipped"] != true {
		t.Fatal(result, err)
	}
	p.Conflict = "rename"
	if _, err := jobForTest().extract(p); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, "output (1)", "nested", "café.txt")); err != nil {
		t.Fatal(err)
	}
}
func TestZipUnsafePathsAndCollisions(t *testing.T) {
	for _, names := range [][]string{{"../escape.txt"}, {"/absolute"}, {"C:/drive"}, {"a\\b"}, {"a/../b"}, {"a//b"}, {"NUL.txt"}, {"a:stream"}, {"trailing. "}, {"a", "A"}, {"a", "a/b"}, {"a/b", "a"}} {
		t.Run(strings.Join(names, "-"), func(t *testing.T) {
			dir, file := makeExtractZip(t, names, false)
			if _, err := jobForTest().extract(extractionPayload(dir, file)); err == nil {
				t.Fatal("unsafe ZIP accepted")
			}
			noExtractOutput(t, dir)
		})
	}
	dir, file := makeExtractZip(t, []string{"link"}, true)
	if _, err := jobForTest().extract(extractionPayload(dir, file)); err == nil {
		t.Fatal("symlink accepted")
	}
	noExtractOutput(t, dir)
}
func TestZipCorruptionLimitsAndCancellation(t *testing.T) {
	for _, scenario := range []string{"crc", "size", "cancel", "encrypted"} {
		t.Run(scenario, func(t *testing.T) {
			dir, file := makeExtractZip(t, []string{"first.txt", "second.txt"}, false)
			data, _ := os.ReadFile(file)
			if scenario == "crc" {
				offset := bytes.Index(data, []byte("content"))
				data[offset] = 'X'
				os.WriteFile(file, data, 0600)
			}
			if scenario == "size" {
				offset := bytes.Index(data, []byte{'P', 'K', 1, 2})
				binary.LittleEndian.PutUint32(data[offset+24:], uint32(extractMaxFile+1))
				os.WriteFile(file, data, 0600)
			}
			if scenario == "encrypted" {
				offset := bytes.Index(data, []byte{'P', 'K', 1, 2})
				binary.LittleEndian.PutUint16(data[offset+8:], 1)
				os.WriteFile(file, data, 0600)
			}
			j := jobForTest()
			if scenario == "cancel" {
				j.cancel()
			}
			if _, err := j.extract(extractionPayload(dir, file)); err == nil {
				t.Fatal("expected rejection")
			}
			noExtractOutput(t, dir)
		})
	}
}
