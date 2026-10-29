package main

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
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

func TestImagePreviewCancellationBeforeStartAndWhileQueued(t *testing.T) {
	h := newHost(io.Discard)
	operation, err := h.imageOperation("cancelled-before-start")
	if err != nil {
		t.Fatal(err)
	}
	operation.cancel()
	if _, err = h.previewImage(Payload{Session: "cancelled-before-start"}, false); !errors.Is(err, context.Canceled) {
		t.Fatal("early cancellation was lost", err)
	}
	if len(h.imageRequests) != 0 {
		t.Fatal("completed operation leaked")
	}
	imageSlots <- struct{}{}
	imageSlots <- struct{}{}
	defer func() { <-imageSlots; <-imageSlots }()
	operation, _ = h.imageOperation("cancelled-in-queue")
	finished := make(chan error, 1)
	go func() { _, err := h.previewImage(Payload{Session: "cancelled-in-queue"}, false); finished <- err }()
	operation.cancel()
	select {
	case err := <-finished:
		if !errors.Is(err, context.Canceled) {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("queued decoder did not stop")
	}
	if _, err := h.imageOperation("bad/path"); err == nil {
		t.Fatal("invalid identifier accepted")
	}
	for i := 0; i < 64; i++ {
		h.imageOperation(fmt.Sprintf("stopped-%d", i))
	}
	if _, err := h.imageOperation("overflow"); err == nil {
		t.Fatal("unbounded preview operations")
	}
	for _, operation := range h.imageRequests {
		operation.cancel()
	}
}
