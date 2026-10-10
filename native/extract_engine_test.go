package main

import (
	"encoding/binary"
	"hash/crc32"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func extractionEngine(t *testing.T) {
	t.Helper()
	cwd, _ := os.Getwd()
	tools := filepath.Join(cwd, "tools")
	if _, err := os.Stat(filepath.Join(tools, "7z.exe")); err != nil {
		t.Skip("7-Zip absent")
	}
	t.Setenv("PATH", tools+string(os.PathListSeparator)+os.Getenv("PATH"))
}

func TestSupported7zip(t *testing.T) {
	for _, banner := range []string{"7-Zip 23.01 (x64)", "7-Zip 26.02 (x64)", "unknown"} {
		if supported7zip(banner) {
			t.Fatal("unqualified engine accepted", banner)
		}
	}
	for _, banner := range []string{"\n7-Zip 26.03 (x64)", "7-Zip 26.04 (x64)", "7-Zip 27.00 (x64)"} {
		if !supported7zip(banner) {
			t.Fatal("supported engine refused", banner)
		}
	}
}

// Minimal RAR4 fixture: one stored file, with header and data CRCs.
func writeStoredRAR(t *testing.T, path, name string, data []byte) {
	t.Helper()
	archive := []byte{'R', 'a', 'r', '!', 0x1a, 7, 0}
	appendHeader := func(header []byte) {
		binary.LittleEndian.PutUint16(header, uint16(crc32.ChecksumIEEE(header[2:])))
		archive = append(archive, header...)
	}
	main := make([]byte, 13)
	main[2] = 0x73
	binary.LittleEndian.PutUint16(main[5:], 13)
	appendHeader(main)
	file := make([]byte, 32+len(name))
	file[2] = 0x74
	binary.LittleEndian.PutUint16(file[3:], 0x8000)
	binary.LittleEndian.PutUint16(file[5:], uint16(len(file)))
	binary.LittleEndian.PutUint32(file[7:], uint32(len(data)))
	binary.LittleEndian.PutUint32(file[11:], uint32(len(data)))
	file[15] = 2
	binary.LittleEndian.PutUint32(file[16:], crc32.ChecksumIEEE(data))
	file[24] = 20
	file[25] = 0x30
	binary.LittleEndian.PutUint16(file[26:], uint16(len(name)))
	binary.LittleEndian.PutUint32(file[28:], 0x20)
	copy(file[32:], name)
	appendHeader(file)
	archive = append(archive, data...)
	end := make([]byte, 7)
	end[2] = 0x7b
	binary.LittleEndian.PutUint16(end[5:], 7)
	appendHeader(end)
	if err := os.WriteFile(path, archive, 0600); err != nil {
		t.Fatal(err)
	}
}
func TestEngineExtract7zAndRAR(t *testing.T) {
	extractionEngine(t)
	for _, extension := range []string{".7z", ".rar"} {
		t.Run(extension, func(t *testing.T) {
			dir := t.TempDir()
			archive := filepath.Join(dir, "sample"+extension)
			name := "nested/sample.txt"
			if extension == ".rar" {
				writeStoredRAR(t, archive, name, []byte("hello"))
			} else {
				os.MkdirAll(filepath.Join(dir, "nested"), 0700)
				put(t, filepath.Join(dir, "nested", "sample.txt"), "hello")
				if _, err := runTool("7z", []string{"a", "-t7z", archive, "nested"}, dir); err != nil {
					t.Fatal(err)
				}
			}
			j := jobForTest()
			p := Payload{Paths: []string{archive}, Destination: dir, Name: "output", Conflict: "error"}
			if _, err := j.extract(p); err != nil {
				t.Fatal(err)
			}
			data, err := os.ReadFile(filepath.Join(dir, "output", "nested", "sample.txt"))
			if err != nil || string(data) != "hello" {
				t.Fatal(string(data), err)
			}
			p.Merge = true
			p.Destination = filepath.Join(dir, "output")
			p.Conflict = "rename"
			if _, err := jobForTest().extract(p); err != nil {
				t.Fatal(err)
			}
			data, err = os.ReadFile(filepath.Join(dir, "output", "nested", "sample (1).txt"))
			if err != nil || string(data) != "hello" {
				t.Fatal("engine merge failed", err)
			}
			rows, _ := os.ReadDir(dir)
			for _, r := range rows {
				if strings.HasPrefix(r.Name(), ".nextexplorer-") {
					t.Fatal("temporary directory left behind")
				}
			}
		})
	}
}
func TestEngineListRejectsUnsafeEntries(t *testing.T) {
	for _, block := range []string{
		"Path = ../outside\nSize = 1\nEncrypted = -",
		"Path = @list\nSize = 1",
		"Path = safe\nSize = 1\nSymbolic Link = elsewhere",
		"Path = safe\nSize = 1\nHard Link = elsewhere",
		"Path = safe\nSize = 1\nEncrypted = +",
		"Path = safe\nSize = 1\nSplit After = +",
		"Path = safe\nSize = 268435457",
		"Path = safe\nSize = 1\nSize = 2",
		"Path = safe\nSize = 1\n\nPath = SAFE\nSize = 1",
	} {
		if _, err := parseEngineList(block); err == nil {
			t.Fatalf("accepted %q", block)
		}
	}
}
func TestEngineCorruptAndCancelled(t *testing.T) {
	extractionEngine(t)
	dir := t.TempDir()
	archive := filepath.Join(dir, "sample.rar")
	writeStoredRAR(t, archive, "file.txt", []byte("content"))
	data, _ := os.ReadFile(archive)
	data[len(data)-8] ^= 0xff
	os.WriteFile(archive, data, 0600)
	for _, cancel := range []bool{false, true} {
		j := jobForTest()
		if cancel {
			j.cancel()
		}
		if _, err := j.extract(Payload{Paths: []string{archive}, Destination: dir, Name: "output", Conflict: "error"}); err == nil {
			t.Fatal("expected failure")
		}
		noExtract := filepath.Join(dir, "output")
		if _, err := os.Stat(noExtract); !os.IsNotExist(err) {
			t.Fatal("published corrupt output")
		}
	}
}
