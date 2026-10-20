package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"
)

// PDF extraction never rasterizes pages; the optional process has a deadline and bounded output.
func extractPDF(path string) (any, error) {
	a, e := validPath(path)
	if e != nil {
		return nil, e
	}
	before, e := os.Lstat(a)
	if e != nil {
		return nil, e
	}
	if !before.Mode().IsRegular() || !strings.EqualFold(filepath.Ext(a), ".pdf") || before.Size() > 8*1024*1024 {
		return nil, fmt.Errorf("PDF ordinaire de 8 Mio maximum requis")
	}
	f, e := os.Open(a)
	if e != nil {
		return nil, e
	}
	header := make([]byte, 5)
	_, e = f.Read(header)
	f.Close()
	if e != nil || string(header) != "%PDF-" {
		return nil, fmt.Errorf("Signature PDF absente")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	text, e := commandOutput(ctx, "pdftotext", []string{"-f", "1", "-l", "10", "-enc", "UTF-8", "-nopgbrk", a, "-"}, "")
	if e != nil {
		return nil, e
	}
	after, e := os.Lstat(a)
	if e != nil || !os.SameFile(before, after) || after.Size() != before.Size() || !after.ModTime().Equal(before.ModTime()) {
		return nil, fmt.Errorf("PDF modifié pendant la lecture")
	}
	raw := []byte(text)
	if len(raw) > 16*1024 {
		raw = raw[:16*1024]
	}
	for len(raw) > 0 && !utf8.Valid(raw) {
		raw = raw[:len(raw)-1]
	}
	note := "PDF : extrait limité aux 10 premières pages et 16 Kio"
	if strings.TrimSpace(string(raw)) == "" {
		note = "Aucun texte extrait · PDF scanné, vide ou police non extractible ; OCR absent"
	}
	return M{"text": string(raw), "note": note}, nil
}
