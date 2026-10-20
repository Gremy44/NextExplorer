package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestPDFExtractionBoundaries(t *testing.T) {
	dir := t.TempDir()
	invalid := filepath.Join(dir, "invalid.pdf")
	if err := os.WriteFile(invalid, []byte("plain text"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := extractPDF(invalid); err == nil {
		t.Fatal("invalid PDF accepted")
	}
	if _, err := extractPDF("relative.pdf"); err == nil {
		t.Fatal("relative path accepted")
	}
	large := filepath.Join(dir, "large.pdf")
	f, err := os.Create(large)
	if err != nil {
		t.Fatal(err)
	}
	f.Write([]byte("%PDF-1.7"))
	f.Truncate(9 * 1024 * 1024)
	f.Close()
	if _, err := extractPDF(large); err == nil {
		t.Fatal("large PDF accepted")
	}
	if _, err := extractPDF(dir); err == nil {
		t.Fatal("directory accepted")
	}
}
