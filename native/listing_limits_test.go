package main

import (
	"fmt"
	"path/filepath"
	"testing"
)

func TestDirectoryListingIsBoundedAndFilterCanFindLaterNames(t *testing.T) {
	dir := t.TempDir()
	for i := 0; i < 10002; i++ {
		put(t, filepath.Join(dir, fmt.Sprintf("%05d.txt", i)), "")
	}
	put(t, filepath.Join(dir, "zzz-proof.txt"), "proof")
	value, err := listDir(Payload{Path: dir, Limit: -1})
	if err != nil {
		t.Fatal(err)
	}
	listing := value.(M)
	if listing["total"].(int) != 10000 || listing["truncated"] != true {
		t.Fatal("listing limit absent", listing["total"], listing["truncated"])
	}
	value, err = listDir(Payload{Path: dir, Filter: "zzz-proof", Limit: -1})
	if err != nil {
		t.Fatal(err)
	}
	listing = value.(M)
	if listing["total"].(int) != 1 || listing["truncated"] != false {
		t.Fatal("filter did not examine later names")
	}
}
