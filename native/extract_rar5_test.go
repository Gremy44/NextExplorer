package main

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func rar5Expected(magic, size int) []byte {
	data := make([]byte, size)
	for i := 0; i < size/4; i++ {
		k := i + 1
		v := k*k - 3*k + 1 + magic
		if v < 0 {
			v = 0
		}
		binary.LittleEndian.PutUint32(data[i*4:], uint32(v))
	}
	return data
}
func TestRAR5ExtractionAndMerge(t *testing.T) {
	extractionEngine(t)
	for _, name := range []string{"stored", "compressed", "multiple_files_solid"} {
		for _, policy := range []string{"new", "rename", "skip", "overwrite"} {
			t.Run(name+"/"+policy, func(t *testing.T) {
				dir := t.TempDir()
				source := filepath.Join("testdata", "rar5", name+".rar")
				archive := filepath.Join(dir, "source.rar")
				content, err := os.ReadFile(source)
				if err != nil {
					t.Fatal(err)
				}
				os.WriteFile(archive, content, 0600)
				expected := map[string][]byte{}
				switch name {
				case "stored":
					expected["helloworld.txt"] = []byte("hello libarchive test suite!\n")
				case "compressed":
					expected["test.bin"] = rar5Expected(0, 1200)
				default:
					for i := 1; i <= 4; i++ {
						expected[fmt.Sprintf("test%d.bin", i)] = rar5Expected(i, 4096)
					}
				}
				dest := filepath.Join(dir, "dest")
				os.Mkdir(dest, 0700)
				p := Payload{Paths: []string{archive}, Destination: dest, Name: "output", Conflict: "error"}
				target := filepath.Join(dest, "output")
				if policy != "new" {
					p.Merge = true
					p.Conflict = policy
					target = dest
					for file := range expected {
						put(t, filepath.Join(dest, file), "previous")
					}
				}
				j := jobForTest()
				if _, err := j.extract(p); err != nil {
					t.Fatal(err)
				}
				for file, want := range expected {
					output := file
					if policy == "rename" {
						ext := filepath.Ext(file)
						output = strings.TrimSuffix(file, ext) + " (1)" + ext
					}
					if policy == "skip" {
						want = []byte("previous")
					}
					got, err := os.ReadFile(filepath.Join(target, output))
					if err != nil || !bytes.Equal(want, got) {
						t.Fatalf("%s: wrong data (%v)", file, err)
					}
				}
				after, _ := os.ReadFile(archive)
				if !bytes.Equal(content, after) {
					t.Fatal("archive modified")
				}
				rows, _ := os.ReadDir(dest)
				for _, row := range rows {
					if strings.HasPrefix(row.Name(), ".nextexplorer-") && row.Name() != ".nextexplorer-trash" {
						t.Fatal("temporary directory remains")
					}
				}
			})
		}
	}
}
func TestRAR5Refusals(t *testing.T) {
	extractionEngine(t)
	for _, name := range []string{"encrypted", "encrypted_filenames", "symlink", "hardlink", "multiarchive.part01", "corrupt", "cancel"} {
		t.Run(name, func(t *testing.T) {
			dir := t.TempDir()
			fixture := name
			if name == "corrupt" || name == "cancel" {
				fixture = "compressed"
			}
			data, err := os.ReadFile(filepath.Join("testdata", "rar5", fixture+".rar"))
			if err != nil {
				t.Fatal(err)
			}
			if name == "corrupt" {
				data = data[:len(data)/2]
			}
			archive := filepath.Join(dir, "source.rar")
			os.WriteFile(archive, data, 0600)
			j := jobForTest()
			if name == "cancel" {
				j.cancel()
			}
			if _, err := j.extract(Payload{Paths: []string{archive}, Destination: dir, Name: "output", Conflict: "error"}); err == nil {
				t.Fatal("unsupported archive accepted")
			}
			rows, _ := os.ReadDir(dir)
			if len(rows) != 1 || rows[0].Name() != "source.rar" {
				t.Fatal("unexpected output after refusal", rows)
			}
		})
	}
}
