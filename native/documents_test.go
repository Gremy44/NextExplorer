package main

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestEditorHistoryAndConflicts(t *testing.T) {
	h := &Host{journalDir: t.TempDir()}
	path := filepath.Join(t.TempDir(), "notes.txt")
	old := "\ufeffbonjour\r\nmonde\r\n"
	if err := os.WriteFile(path, []byte(old), 0600); err != nil {
		t.Fatal(err)
	}
	value, err := readEditor(path)
	if err != nil {
		t.Fatal(err)
	}
	doc := value.(M)
	entry := doc["entry"].(Entry)
	p := Payload{Path: path, Expected: &entry, Snapshot: doc["hash"].(string), Text: "nouveau\ntexte\n"}
	if _, err = h.saveEditor(p); err != nil {
		t.Fatal(err)
	}
	current, _ := os.ReadFile(path)
	if string(current) != "\ufeffnouveau\r\ntexte\r\n" {
		t.Fatalf("BOM/CRLF: %q", current)
	}
	if _, err = h.saveEditor(p); err == nil {
		t.Fatal("stale save accepted")
	}
	versions, err := h.versionList(path)
	if err != nil || len(versions) != 1 {
		t.Fatal(versions, err)
	}
	v := Payload{Path: path, Name: versions[0].ID}
	restored, err := h.fileVersions("FILE_VERSION_RESTORE", v)
	if err != nil {
		t.Fatal(err)
	}
	restoredBytes, _ := os.ReadFile(restored.(M)["path"].(string))
	if string(restoredBytes) != old {
		t.Fatal("wrong restored content")
	}
	unchanged, _ := os.ReadFile(path)
	if !bytes.Equal(current, unchanged) {
		t.Fatal("restore overwrote original")
	}
	if _, err = h.fileVersions("FILE_VERSION_READ", Payload{Path: path, Name: "../../escape"}); err == nil {
		t.Fatal("unknown version accepted")
	}
	// Same size and restored mtime must still be rejected by the content fingerprint.
	value, _ = readEditor(path)
	doc = value.(M)
	entry = doc["entry"].(Entry)
	info, _ := os.Stat(path)
	changed := bytes.ReplaceAll(current, []byte("nouveau"), []byte("modifie"))
	os.WriteFile(path, changed, 0600)
	os.Chtimes(path, info.ModTime(), info.ModTime())
	if _, err = h.saveEditor(Payload{Path: path, Expected: &entry, Snapshot: doc["hash"].(string), Text: "lost"}); err == nil {
		t.Fatal("same-stat external change accepted")
	}
	root, _ := h.versionsRoot()
	os.WriteFile(filepath.Join(root, v.Name+".bin"), []byte("corrupt"), 0600)
	if _, err = h.fileVersions("FILE_VERSION_RESTORE", v); err == nil {
		t.Fatal("corrupt version restored")
	}
	if _, err = h.fileVersions("FILE_VERSION_DELETE", v); err != nil {
		t.Fatal(err)
	}
}

func TestEditorLimitsAndQuota(t *testing.T) {
	h := &Host{journalDir: t.TempDir()}
	path := filepath.Join(t.TempDir(), "file.txt")
	for _, data := range [][]byte{{0, 1, 2}, bytes.Repeat([]byte("x"), editorLimit+1), {0xff}} {
		os.WriteFile(path, data, 0600)
		if _, err := readEditor(path); err == nil {
			t.Fatal("unsafe editor input accepted")
		}
	}
	os.WriteFile(path, []byte("original"), 0600)
	for i := 0; i < 20; i++ {
		if _, err := h.keepVersion(path, []byte(fmt.Sprint(i))); err != nil {
			t.Fatal(err)
		}
	}
	value, _ := readEditor(path)
	doc := value.(M)
	entry := doc["entry"].(Entry)
	if _, err := h.saveEditor(Payload{Path: path, Expected: &entry, Snapshot: doc["hash"].(string), Text: "new"}); err == nil {
		t.Fatal("quota ignored")
	}
	data, _ := os.ReadFile(path)
	if string(data) != "original" {
		t.Fatal("quota failure changed original")
	}
	lock, err := openEditorExclusive(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = h.saveEditor(Payload{Path: path, Expected: &entry, Snapshot: doc["hash"].(string), Text: "new"}); err == nil {
		t.Fatal("exclusive lock ignored")
	}
	lock.Close()
}

func TestOfficeExtraction(t *testing.T) {
	for _, tc := range []struct{ ext, part, xml, want string }{
		{"docx", "word/document.xml", `<document><p><r><t>astro</t></r><r><t>naute</t></r></p></document>`, "astronaute"},
		{"xlsx", "xl/worksheets/sheet1.xml", `<worksheet><c t="inlineStr"><is><t>budget</t></is></c><c><v>12345</v></c><c t="s"><v>999</v></c></worksheet>`, "budget\n12345"},
		{"pptx", "ppt/slides/slide1.xml", `<slide><p><t>présentation</t></p></slide>`, "présentation"},
	} {
		t.Run(tc.ext, func(t *testing.T) {
			var b bytes.Buffer
			z := zip.NewWriter(&b)
			w, _ := z.Create(tc.part)
			w.Write([]byte(tc.xml))
			w, _ = z.Create("external.xml")
			w.Write([]byte("DO_NOT_INDEX"))
			z.Close()
			path := filepath.Join(t.TempDir(), "sample."+tc.ext)
			os.WriteFile(path, b.Bytes(), 0600)
			result, err := extractOffice(path)
			if err != nil {
				t.Fatal(err)
			}
			text := result.(M)["text"].(string)
			if !strings.Contains(text, tc.want) || strings.Contains(text, "DO_NOT_INDEX") || strings.Contains(text, "999") {
				t.Fatal(text)
			}
		})
	}
	var b bytes.Buffer
	z := zip.NewWriter(&b)
	w, _ := z.Create("word/document.xml")
	w.Write([]byte(`<document><t>broken</document>`))
	z.Close()
	path := filepath.Join(t.TempDir(), "bad.docx")
	os.WriteFile(path, b.Bytes(), 0600)
	if _, err := extractOffice(path); err == nil {
		t.Fatal("invalid XML accepted")
	}
}

func TestBrowseArchiveAndSelectedExtraction(t *testing.T) {
	dir, path := makeExtractZip(t, []string{"nested/one.txt", "nested/two.txt", "other.txt"}, false)
	entry, _ := statEntry(path)
	p := Payload{Path: path, Expected: &entry}
	value, err := browseArchive(p, false)
	if err != nil || len(value.(M)["entries"].([]M)) != 3 {
		t.Fatal(value, err)
	}
	p.Name = "nested/one.txt"
	value, err = browseArchive(p, true)
	if err != nil {
		t.Fatal(err)
	}
	data, _ := base64.StdEncoding.DecodeString(value.(M)["data"].(string))
	if string(data) != "content" {
		t.Fatal(string(data))
	}
	p.Name = "../escape"
	if _, err = browseArchive(p, true); err == nil {
		t.Fatal("unknown member accepted")
	}
	extract := extractionPayload(dir, path)
	extract.Expected = &entry
	extract.Members = []string{"nested/one.txt"}
	if _, err = jobForTest().extract(extract); err != nil {
		t.Fatal(err)
	}
	if _, err = os.Stat(filepath.Join(dir, "output", "nested", "one.txt")); err != nil {
		t.Fatal(err)
	}
	if _, err = os.Stat(filepath.Join(dir, "output", "nested", "two.txt")); !os.IsNotExist(err) {
		t.Fatal("unselected file extracted")
	}
	if !memberSelected("nested/one.txt", []string{"nested/"}) || memberSelected("nested-extra/x", []string{"nested/"}) {
		t.Fatal("folder boundary")
	}
	for _, name := range []string{"../x", "C:/x", "a\\b"} {
		if validateMembers([]string{name}) == nil {
			t.Fatal(name)
		}
	}
	_, bad := makeExtractZip(t, []string{"../escape"}, false)
	if _, err = archiveInventory(bad); err == nil {
		t.Fatal("unsafe archive browsed")
	}
}

func TestNeighborSubtitles(t *testing.T) {
	dir := t.TempDir()
	video := filepath.Join(dir, "film.mp4")
	os.WriteFile(video, []byte("fixture"), 0600)
	entry, _ := statEntry(video)
	for _, name := range []string{"film.srt", "film.fr.vtt", "FILM.EN.SRT"} {
		if !matchingSubtitle(video, name) {
			t.Fatal(name)
		}
	}
	for _, name := range []string{"../film.srt", "other.srt", "film2.srt", "film.exe"} {
		if matchingSubtitle(video, name) {
			t.Fatal(name)
		}
	}
	os.WriteFile(filepath.Join(dir, "film.srt"), []byte("1\n00:00:00,000 --> 00:00:01,000\nBonjour\n"), 0600)
	value, err := mediaDetails(Payload{Path: video, Expected: &entry, Name: "film.srt", Mode: "neighbor"}, true)
	if err != nil || !strings.Contains(value.(M)["text"].(string), "Bonjour") {
		t.Fatal(value, err)
	}
	os.WriteFile(filepath.Join(dir, "film.srt"), bytes.Repeat([]byte("x"), (128<<10)+1), 0600)
	if _, err = mediaDetails(Payload{Path: video, Expected: &entry, Name: "film.srt"}, true); err == nil {
		t.Fatal("oversized subtitle accepted")
	}
	if subtitleCodec("hdmv_pgs_subtitle") || !subtitleCodec("subrip") {
		t.Fatal("text codec restriction")
	}
}
