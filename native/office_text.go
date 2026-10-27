package main

import (
	"archive/zip"
	"encoding/xml"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// OOXML is read as bounded XML, never rendered or executed, including external relationships.
func extractOffice(path string) (any, error) {
	a, err := validPath(path)
	if err != nil {
		return nil, err
	}
	ext := strings.ToLower(filepath.Ext(a))
	if ext != ".docx" && ext != ".xlsx" && ext != ".pptx" {
		return nil, fmt.Errorf("Document DOCX, XLSX ou PPTX requis")
	}
	before, err := os.Lstat(a)
	if err != nil {
		return nil, err
	}
	if !before.Mode().IsRegular() || before.Size() > 32<<20 {
		return nil, fmt.Errorf("Document ordinaire de 32 Mio maximum requis")
	}
	f, err := os.Open(a)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	opened, err := f.Stat()
	if err != nil || !os.SameFile(before, opened) {
		return nil, fmt.Errorf("Document remplacé")
	}
	z, err := zip.NewReader(f, before.Size())
	if err != nil {
		return nil, err
	}
	if len(z.File) > 10000 {
		return nil, fmt.Errorf("Document trop complexe")
	}
	parts := []*zip.File{}
	for _, p := range z.File {
		n := p.Name
		if (ext == ".docx" && (n == "word/document.xml" || strings.HasPrefix(n, "word/header") || strings.HasPrefix(n, "word/footer"))) || (ext == ".xlsx" && (n == "xl/sharedStrings.xml" || strings.HasPrefix(n, "xl/worksheets/sheet"))) || (ext == ".pptx" && strings.HasPrefix(n, "ppt/slides/slide")) {
			if strings.HasSuffix(n, ".xml") {
				parts = append(parts, p)
			}
		}
	}
	sort.Slice(parts, func(i, j int) bool { return parts[i].Name < parts[j].Name })
	var out strings.Builder
	remaining := int64(8 << 20)
	truncated := false
	for i, p := range parts {
		if i >= 200 || out.Len() >= 16<<10 || p.UncompressedSize64 > uint64(remaining) {
			truncated = true
			break
		}
		remaining -= int64(p.UncompressedSize64)
		r, err := p.Open()
		if err != nil {
			return nil, err
		}
		d := xml.NewDecoder(io.LimitReader(r, int64(p.UncompressedSize64)+1))
		capture := false
		cellType := ""
		for {
			t, e := d.Token()
			if e == io.EOF {
				break
			}
			if e != nil {
				r.Close()
				return nil, fmt.Errorf("XML Office invalide : %w", e)
			}
			switch t := t.(type) {
			case xml.StartElement:
				if t.Name.Local == "c" {
					cellType = ""
					for _, a := range t.Attr {
						if a.Name.Local == "t" {
							cellType = a.Value
						}
					}
				}
				capture = t.Name.Local == "t" || (ext == ".xlsx" && t.Name.Local == "v" && cellType != "s")
			case xml.CharData:
				if capture {
					out.WriteString(string(t))
				}
			case xml.EndElement:
				if t.Name.Local == "t" || t.Name.Local == "v" {
					capture = false
				}
				if t.Name.Local == "p" || t.Name.Local == "si" || t.Name.Local == "c" {
					out.WriteByte('\n')
				}
			}
			if out.Len() >= 16<<10 {
				truncated = true
				break
			}
		}
		r.Close()
	}
	after, err := os.Lstat(a)
	if err != nil || !os.SameFile(before, after) || before.Size() != after.Size() || !before.ModTime().Equal(after.ModTime()) {
		return nil, fmt.Errorf("Document modifié pendant l’extraction")
	}
	note := "Texte Office extrait localement (texte, sans OCR ni mise en page)"
	if truncated {
		note = "Extrait Office partiel : 16 Kio de texte, 200 parties ou 8 Mio de XML maximum"
	}
	text := out.String()
	if len(text) > 16<<10 {
		text = text[:16<<10]
		text = strings.ToValidUTF8(text, "")
	}
	if strings.TrimSpace(text) == "" {
		note = "Aucun texte Office extrait (images sans OCR)"
	}
	return M{"text": text, "note": note}, nil
}
