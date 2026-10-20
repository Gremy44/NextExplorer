package main

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestBoundedImagePreviewAndSample(t *testing.T) {
	cwd, _ := os.Getwd()
	t.Setenv("PATH", filepath.Join(cwd, "tools")+string(os.PathListSeparator)+os.Getenv("PATH"))
	if _, err := toolPath("magick"); err != nil {
		t.Skip(err)
	}
	source := filepath.Join(t.TempDir(), "image.png")
	data, _ := os.ReadFile(filepath.Join(cwd, "../public/icon128.png"))
	os.WriteFile(source, data, 0600)
	entry, _ := statEntry(source)
	value, err := imagePreview(Payload{Path: source, Expected: &entry, Width: 64}, false)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := base64.StdEncoding.DecodeString(value.(M)["data"].(string))
	if err != nil || len(raw) > 700*1024 || len(raw) < 3 || raw[0] != 255 || raw[1] != 216 {
		t.Fatal("invalid thumbnail", err)
	}
	value, err = imagePreview(Payload{Path: source, Expected: &entry}, true)
	if err != nil || len(value.(M)["pixels"].(string)) != 432 {
		t.Fatal(value, err)
	}
	entry.Size++
	if _, err = imagePreview(Payload{Path: source, Expected: &entry}, true); err == nil {
		t.Fatal("changed image decoded")
	}
	fake := filepath.Join(t.TempDir(), "fake.png")
	put(t, fake, `<svg xmlns="http://www.w3.org/2000/svg"><image href="http://example.invalid/test"/></svg>`)
	bad, _ := statEntry(fake)
	if _, err = imagePreview(Payload{Path: fake, Expected: &bad}, true); err == nil {
		t.Fatal("wrong coder accepted")
	}
	large := filepath.Join(t.TempDir(), "huge.tiff")
	f, _ := os.Create(large)
	f.Truncate(imageFileLimit + 1)
	f.Close()
	huge, _ := statEntry(large)
	if _, err = imagePreview(Payload{Path: large, Expected: &huge}, false); err == nil || !strings.Contains(err.Error(), "256 Mio") {
		t.Fatal("unbounded image accepted", err)
	}
}
