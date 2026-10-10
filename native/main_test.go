package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func put(t *testing.T, path, text string) {
	t.Helper()
	if e := os.WriteFile(path, []byte(text), 0600); e != nil {
		t.Fatal(e)
	}
}
func jobForTest() *Job {
	ctx, cancel := context.WithCancel(context.Background())
	return &Job{ID: "test", State: "running", started: time.Now(), ctx: ctx, cancel: cancel, host: newHost(&bytes.Buffer{})}
}
func TestFraming(t *testing.T) {
	var b bytes.Buffer
	h := newHost(&b)
	h.send(M{"id": "é", "data": "日本語"})
	raw, e := readFrame(&b)
	if e != nil {
		t.Fatal(e)
	}
	var v M
	if json.Unmarshal(raw, &v) != nil || v["id"] != "é" {
		t.Fatal(string(raw))
	}
	for _, n := range []uint32{0, maxFrame + 1} {
		b.Reset()
		binary.Write(&b, binary.LittleEndian, n)
		if _, e := readFrame(&b); e == nil {
			t.Fatal("oversized frame accepted")
		}
	}
	b.Reset()
	binary.Write(&b, binary.LittleEndian, uint32(5))
	b.WriteString("ab")
	if _, e := readFrame(&b); e == nil {
		t.Fatal("truncated frame accepted")
	}
}
func TestOrigin(t *testing.T) {
	config := []byte(`{"allowed_origins":["chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/"]}`)
	if !originAllowed("chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", config) {
		t.Fatal("valid origin rejected")
	}
	for _, o := range []string{"", "https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/", "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/evil"} {
		if originAllowed(o, config) {
			t.Fatal("bad origin accepted", o)
		}
	}
}
func TestPathsAndListing(t *testing.T) {
	dir := t.TempDir()
	for _, n := range []string{"..", "x/y", "x\\y", "CON.txt", "abc.", "file:stream"} {
		if validName(n) == nil {
			t.Fatal(n)
		}
	}
	if _, e := validPath("relative"); e == nil {
		t.Fatal("relative accepted")
	}
	put(t, filepath.Join(dir, "école.txt"), "bonjour")
	put(t, filepath.Join(dir, ".secret"), "x")
	os.Mkdir(filepath.Join(dir, "folder"), 0700)
	v, e := listDir(Payload{Path: dir, Limit: 1})
	if e != nil {
		t.Fatal(e)
	}
	r := v.(M)
	if r["total"] != 2 || r["entries"].([]Entry)[0].Type != "directory" {
		t.Fatal(r)
	}
	v, e = listDir(Payload{Path: dir, Filter: "ÉCOLE"})
	if e != nil || v.(M)["total"] != 1 {
		t.Fatal(v, e)
	}
}
func TestReadWriteAndUpload(t *testing.T) {
	dir := t.TempDir()
	p := Payload{Path: dir, Name: "test.txt", Text: "héllo"}
	if _, e := writeFile(p); e != nil {
		t.Fatal(e)
	}
	p.Text = "overwrite"
	if _, e := writeFile(p); e == nil {
		t.Fatal("overwrote existing")
	}
	h := newHost(&bytes.Buffer{})
	data := bytes.Repeat([]byte("0123456789"), 90000)
	offset := 0
	for offset < len(data) {
		end := min(offset+250000, len(data))
		_, e := h.upload(Payload{Path: dir, Name: "upload.bin", Offset: offset, Data: base64.StdEncoding.EncodeToString(data[offset:end]), Final: end == len(data)})
		if e != nil {
			t.Fatal(e)
		}
		offset = end
	}
	actual, _ := os.ReadFile(filepath.Join(dir, "upload.bin"))
	if !bytes.Equal(actual, data) {
		t.Fatal("upload corrupted")
	}
	v, e := readChunk(Payload{Path: filepath.Join(dir, "upload.bin"), Offset: 800000, Limit: 384 * 1024})
	if e != nil || v.(M)["eof"] != true {
		t.Fatal(v, e)
	}
}
func TestRenameDryRunAndCollision(t *testing.T) {
	dir := t.TempDir()
	a, b := filepath.Join(dir, "photo-1.txt"), filepath.Join(dir, "photo-2.txt")
	put(t, a, "a")
	put(t, b, "b")
	p := Payload{Paths: []string{a, b}, Pattern: `photo-(\d)`, Replacement: "image-$1", Prefix: "new-"}
	v, e := batchRename(p)
	if e != nil || !v.(M)["valid"].(bool) {
		t.Fatal(v, e)
	}
	if _, e = os.Stat(a); e != nil {
		t.Fatal("dry run mutated")
	}
	p.Apply = true
	if _, e = batchRename(p); e != nil {
		t.Fatal(e)
	}
	if _, e = os.Stat(filepath.Join(dir, "new-image-1.txt")); e != nil {
		t.Fatal(e)
	}
	p = Payload{Paths: []string{filepath.Join(dir, "new-image-1.txt"), filepath.Join(dir, "new-image-2.txt")}, Pattern: ".*", Replacement: "same", Apply: true}
	if _, e = batchRename(p); e == nil {
		t.Fatal("collision accepted")
	}
}
func TestTrashRestoreNoOverwrite(t *testing.T) {
	dir := t.TempDir()
	a := filepath.Join(dir, "important.txt")
	put(t, a, "keep")
	v, e := trashFiles([]string{a})
	if e != nil {
		t.Fatal(e)
	}
	record := v.([]M)[0]["record"].(string)
	put(t, a, "new")
	if _, e = restoreTrash(record); e == nil {
		t.Fatal("restore overwrote file")
	}
	os.Remove(a)
	if _, e = restoreTrash(record); e != nil {
		t.Fatal(e)
	}
	data, _ := os.ReadFile(a)
	if string(data) != "keep" {
		t.Fatal("lost file")
	}
	if _, e = restoreTrash(filepath.Join(dir, "fake.json")); e == nil {
		t.Fatal("forged record accepted")
	}
}
func TestTransferIntegrityAndConflicts(t *testing.T) {
	dir := t.TempDir()
	src, dst := filepath.Join(dir, "source"), filepath.Join(dir, "target")
	os.Mkdir(src, 0700)
	os.Mkdir(dst, 0700)
	a := filepath.Join(src, "file.txt")
	text := strings.Repeat("abcé", 20000)
	put(t, a, text)
	j := jobForTest()
	p := Payload{Paths: []string{a}, Destination: dst, Mode: "copy", Conflict: "rename"}
	if _, e := j.transfer(p); e != nil {
		t.Fatal(e)
	}
	data, _ := os.ReadFile(filepath.Join(dst, "file.txt"))
	if string(data) != text {
		t.Fatal("corrupt transfer")
	}
	if _, e := j.transfer(p); e != nil {
		t.Fatal(e)
	}
	if _, e := os.Stat(filepath.Join(dst, "file (1).txt")); e != nil {
		t.Fatal(e)
	}
	p.Destination = src
	if _, e := j.transfer(p); e == nil {
		t.Fatal("self copy accepted")
	}
	p.Destination = dst
	p.Mode = "move"
	p.Conflict = "overwrite"
	if _, e := j.transfer(p); e != nil {
		t.Fatal(e)
	}
	if _, e := os.Stat(a); !os.IsNotExist(e) {
		t.Fatal("move source exists")
	}
}
func TestCancellationAndAncestry(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "src")
	os.Mkdir(src, 0700)
	nested := filepath.Join(src, "nested")
	os.Mkdir(nested, 0700)
	put(t, filepath.Join(src, "keep.txt"), "keep")
	j := jobForTest()
	if _, e := j.transfer(Payload{Paths: []string{src}, Destination: nested, Mode: "copy", Conflict: "rename"}); e == nil {
		t.Fatal("recursive transfer accepted")
	}
	j.cancel()
	if _, e := j.scan(src, false); e == nil {
		t.Fatal("cancel ignored")
	}
	if _, e := os.Stat(filepath.Join(src, "keep.txt")); e != nil {
		t.Fatal("cancel removed source")
	}
}
func TestHashDuplicatesAndZip(t *testing.T) {
	dir := t.TempDir()
	a, b := filepath.Join(dir, "a.txt"), filepath.Join(dir, "b.txt")
	put(t, a, "abc")
	put(t, b, "abc")
	hash, e := hashFile(a, "sha256")
	if e != nil || hash != "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" {
		t.Fatal(hash, e)
	}
	hash, e = hashFile(a, "blake3")
	if e != nil || hash != "6437b3ac38465133ffb63b75273a8db548c558465d79db03fd359c6cd5bd9d85" {
		t.Fatal(hash, e)
	}
	j := jobForTest()
	r, e := j.scan(dir, true)
	if e != nil || len(r.(M)["groups"].([]M)) != 1 {
		t.Fatal(r, e)
	}
	if _, e = j.zip(Payload{Paths: []string{a, b}, Destination: dir, Name: "test.zip"}); e != nil {
		t.Fatal(e)
	}
	r, e = archiveList(filepath.Join(dir, "test.zip"))
	if e != nil || r.(M)["total"] != 2 {
		t.Fatal(r, e)
	}
}
