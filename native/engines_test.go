package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPortableEngines(t *testing.T) {
	cwd, e := os.Getwd()
	if e != nil {
		t.Fatal(e)
	}
	dir := filepath.Join(cwd, "tools")
	if _, e = os.Stat(filepath.Join(dir, "ffmpeg.exe")); e != nil {
		t.Skip("installer les moteurs avec scripts/setup-engines.ps1")
	}
	t.Setenv("PATH", dir+string(os.PathListSeparator)+os.Getenv("PATH"))
	workspace := t.TempDir()
	source := filepath.Join(workspace, "source.png")
	data, e := os.ReadFile(filepath.Join(cwd, "../public/icon128.png"))
	if e != nil {
		t.Fatal(e)
	}
	if e = os.WriteFile(source, data, 0600); e != nil {
		t.Fatal(e)
	}
	j := jobForTest()
	if _, e = j.convert(Payload{Paths: []string{source}, Destination: workspace, Format: "webp", Quality: 80, Width: 64}); e != nil {
		t.Fatal(e)
	}
	if s, e := os.Stat(filepath.Join(workspace, "source.webp")); e != nil || s.Size() == 0 {
		t.Fatal("WebP absent", e)
	}
	if _, e = j.editMetadata(Payload{Paths: []string{source}, Tags: map[string]string{"Artist": "NextExplorer"}}); e != nil {
		t.Fatal(e)
	}
	tags, e := metadataTags(source)
	if e != nil || tags["Artist"] != "NextExplorer" {
		t.Fatal(tags, e)
	}
	wav := filepath.Join(workspace, "tone.wav")
	if _, e = commandOutput(j.ctx, "ffmpeg", []string{"-nostdin", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.3", "-y", wav}, ""); e != nil {
		t.Fatal(e)
	}
	if _, e = commandOutput(j.ctx, "ffmpeg", []string{"-nostdin", "-i", wav, "-b:a", "128k", filepath.Join(workspace, "tone.mp3")}, ""); e != nil {
		t.Fatal(e)
	}
	mp3 := filepath.Join(workspace, "tone.mp3")
	if _, e = j.editMetadata(Payload{Paths: []string{mp3}, Tags: map[string]string{"Artist": "NextExplorer Audio", "Album": "Album de test"}}); e != nil {
		t.Fatal(e)
	}
	audioTags, e := metadataTags(mp3)
	if e != nil || audioTags["Artist"] != "NextExplorer Audio" || audioTags["Album"] != "Album de test" {
		t.Fatal(audioTags, e)
	}
	if _, e = os.Stat(mp3 + "_original"); e != nil {
		t.Fatal("audio backup missing", e)
	}
	video := filepath.Join(workspace, "video.mp4")
	if _, e = commandOutput(j.ctx, "ffmpeg", []string{"-nostdin", "-f", "lavfi", "-i", "color=c=blue:s=64x64:d=0.3", "-c:v", "libx264", "-y", video}, ""); e != nil {
		t.Fatal(e)
	}
	if _, e = j.convert(Payload{Paths: []string{video}, Destination: workspace, Format: "mkv", Mode: "remux"}); e != nil {
		t.Fatal(e)
	}
	if output, e := runTool("7z", []string{"i"}, ""); e != nil || !strings.Contains(output, "7-Zip") {
		t.Fatal(output, e)
	}
}
func TestPartialTrashRollsBack(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "keep.txt")
	put(t, file, "important")
	if _, e := trashFiles([]string{file, filepath.Join(dir, "missing.txt")}); e == nil {
		t.Fatal("expected error")
	} else {
		t.Log(e)
	}
	data, e := os.ReadFile(file)
	if e != nil || string(data) != "important" {
		t.Fatal("partial trash did not rollback", e)
	}
}
