package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestMediaRangesTokensAndChanges(t *testing.T) {
	path := filepath.Join(t.TempDir(), "audio.mp3")
	put(t, path, "0123456789")
	entry, _ := statEntry(path)
	s := &mediaStreams{base: "http://127.0.0.1:12345", leases: map[string]mediaLease{"secret": {entry: entry, expires: time.Now().Add(time.Minute)}}}
	request := func(token, origin, rangeHeader string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("GET", s.base+"/"+token, nil)
		r.Header.Set("Origin", origin)
		if rangeHeader != "" {
			r.Header.Set("Range", rangeHeader)
		}
		w := httptest.NewRecorder()
		s.ServeHTTP(w, r)
		return w
	}
	w := request("secret", "chrome-extension://test", "bytes=3-5")
	if w.Code != http.StatusPartialContent || w.Body.String() != "345" || w.Header().Get("Content-Range") != "bytes 3-5/10" {
		t.Fatal(w.Code, w.Body.String(), w.Header())
	}
	if request("wrong", "", "").Code != 404 || request("secret", "https://evil.example", "").Code != 403 {
		t.Fatal("invalid capability accepted")
	}
	put(t, path, "changed")
	if request("secret", "", "").Code != 409 {
		t.Fatal("changed file served")
	}
	os.Remove(path)
}
func TestMediaLeaseLimitsAndRevoke(t *testing.T) {
	h := newHost(io.Discard)
	path := filepath.Join(t.TempDir(), "a.wav")
	put(t, path, "wave")
	entry, _ := statEntry(path)
	for i := 0; i < 8; i++ {
		if _, err := h.openMedia(Payload{Path: path, Expected: &entry}); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := h.openMedia(Payload{Path: path, Expected: &entry}); err == nil {
		t.Fatal("unbounded leases")
	}
	for token := range h.streams.leases {
		h.closeMedia(token)
		break
	}
	if _, err := h.openMedia(Payload{Path: path, Expected: &entry}); err != nil {
		t.Fatal(err)
	}
}

func TestPreviewMediaMIMEs(t *testing.T) {
	for ext, expected := range map[string]string{".aac": "audio/aac", ".mkv": "video/x-matroska", ".avi": "video/x-msvideo", ".m4v": "video/mp4"} {
		if mediaMIME(ext) != expected {
			t.Fatalf("wrong preview MIME for %s", ext)
		}
	}
	if mediaMIME(".exe") != "" {
		t.Fatal("executable admitted as media")
	}
}
