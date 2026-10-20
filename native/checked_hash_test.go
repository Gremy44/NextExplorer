package main

import (
	"context"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestCheckedHashSnapshot(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "source.TIFF")
	put(t, file, "abc")
	entry, err := statEntry(file)
	if err != nil {
		t.Fatal(err)
	}
	p := Payload{Path: file, Algorithm: "blake3", Expected: &entry}
	result, err := checkedHash(p)
	if err != nil || result.(M)["hash"] != "6437b3ac38465133ffb63b75273a8db548c558465d79db03fd359c6cd5bd9d85" {
		t.Fatal(result, err)
	}
	if result.(M)["entry"] != entry {
		t.Fatal("snapshot lost")
	}
	data, _ := json.Marshal(p)
	wire, err := newHost(io.Discard).dispatch(Request{Action: "HASH", Payload: data})
	if err != nil || wire.(M)["hash"] != result.(M)["hash"] {
		t.Fatal("checked hash wire mismatch", err)
	}
	data, _ = json.Marshal(Payload{Path: file, Algorithm: "blake3"})
	legacy, err := newHost(io.Discard).dispatch(Request{Action: "HASH", Payload: data})
	if err != nil || legacy != result.(M)["hash"] {
		t.Fatal("legacy HASH response changed", err)
	}
	put(t, file, "xyz")
	stamp := time.Now().Add(time.Second)
	if err = os.Chtimes(file, stamp, stamp); err != nil {
		t.Fatal(err)
	}
	if _, err = checkedHash(p); err == nil {
		t.Fatal("changed snapshot accepted")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err = hashSnapshot(ctx, p); err == nil {
		t.Fatal("cancelled read accepted")
	}
}

func TestCheckedHashBoundsAndTypes(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "large.bin")
	f, err := os.Create(file)
	if err != nil {
		t.Fatal(err)
	}
	if err = f.Truncate(checkedHashLimit + 1); err != nil {
		t.Fatal(err)
	}
	f.Close()
	entry, _ := statEntry(file)
	if _, err = checkedHash(Payload{Path: file, Algorithm: "blake3", Expected: &entry}); err == nil {
		t.Fatal("oversized read accepted")
	}
	directory, _ := statEntry(dir)
	if _, err = checkedHash(Payload{Path: dir, Algorithm: "blake3", Expected: &directory}); err == nil {
		t.Fatal("directory accepted")
	}
	put(t, file, "")
	entry, _ = statEntry(file)
	result, err := checkedHash(Payload{Path: file, Algorithm: "blake3", Expected: &entry})
	legacy, _ := hashFile(file, "blake3")
	if err != nil || result.(M)["hash"] != legacy {
		t.Fatal("empty file hash mismatch", err)
	}
	entry.Stamp = ""
	if _, err = checkedHash(Payload{Path: file, Algorithm: "blake3", Expected: &entry}); err == nil {
		t.Fatal("imprecise snapshot accepted")
	}
	if _, err = checkedHash(Payload{Path: file, Algorithm: "md5", Expected: &entry}); err == nil {
		t.Fatal("wrong algorithm accepted")
	}
	link := filepath.Join(dir, "link.bin")
	if err = os.Symlink(file, link); err != nil {
		t.Log("symlink unavailable:", err)
		return
	}
	entry, _ = statEntry(link)
	if _, err = checkedHash(Payload{Path: link, Algorithm: "blake3", Expected: &entry}); err == nil {
		t.Fatal("symlink accepted")
	}
}
