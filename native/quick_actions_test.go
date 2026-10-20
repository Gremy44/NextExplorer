package main

import (
	"bytes"
	"image"
	_ "image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestQuickActionsValidation(t *testing.T) {
	dir := t.TempDir()
	text := filepath.Join(dir, "text.txt")
	put(t, text, "original")
	for _, p := range []Payload{{Mode: "rotate", Paths: []string{text}, Angle: 90}, {Mode: "trim", Paths: []string{text}, EndSeconds: 1}, {Mode: "rotate", Paths: []string{dir}, Angle: 90}, {Mode: "unknown", Paths: []string{text}}} {
		if validateQuickAction(p) == nil {
			t.Fatal("invalid action accepted", p)
		}
	}
}
func TestQuickImageRotationCreatesCopies(t *testing.T) {
	cwd, _ := os.Getwd()
	t.Setenv("PATH", filepath.Join(cwd, "tools")+string(os.PathListSeparator)+os.Getenv("PATH"))
	if _, err := toolPath("magick"); err != nil {
		t.Skip(err)
	}
	dir := t.TempDir()
	source := filepath.Join(dir, "source.png")
	if _, err := runTool("magick", []string{"-size", "60x40", "xc:none", "-fill", "red", "-draw", "rectangle 0,0 10,20", source}, ""); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(source)
	for count := 0; count < 2; count++ {
		j := jobForTest()
		value, err := j.quickAction(Payload{Mode: "rotate", Paths: []string{source}, Destination: dir, Angle: 90})
		if err != nil {
			t.Fatal(err)
		}
		output, err := os.ReadFile(value.([]string)[0])
		if err != nil {
			t.Fatal(err)
		}
		config, _, err := image.DecodeConfig(bytes.NewReader(output))
		if err != nil || config.Width != 40 || config.Height != 60 {
			t.Fatal("rotation dimensions", config, err)
		}
		if value.([]string)[0] == source {
			t.Fatal("original overwritten")
		}
	}
	after, _ := os.ReadFile(source)
	if !bytes.Equal(before, after) {
		t.Fatal("original changed")
	}
	fake := filepath.Join(dir, "fake.png")
	put(t, fake, "not an image")
	if _, err := jobForTest().quickAction(Payload{Mode: "rotate", Paths: []string{fake}, Destination: dir, Angle: 90}); err == nil {
		t.Fatal("fake image accepted")
	}
}
func TestQuickMediaTrim(t *testing.T) {
	cwd, _ := os.Getwd()
	t.Setenv("PATH", filepath.Join(cwd, "tools")+string(os.PathListSeparator)+os.Getenv("PATH"))
	if _, err := toolPath("ffmpeg"); err != nil {
		t.Skip(err)
	}
	dir := t.TempDir()
	source := filepath.Join(dir, "tone.wav")
	if _, err := runTool("ffmpeg", []string{"-nostdin", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", source}, ""); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(source)
	value, err := jobForTest().quickAction(Payload{Mode: "trim", Paths: []string{source}, Destination: dir, StartSeconds: .25, EndSeconds: 1.25})
	if err != nil {
		t.Fatal(err)
	}
	info, err := inspectQuickMedia(jobForTest().ctx, value.([]string)[0])
	if err != nil || info.Duration < .95 || info.Duration > 1.1 {
		t.Fatal(info, err)
	}
	after, _ := os.ReadFile(source)
	if !bytes.Equal(before, after) {
		t.Fatal("audio changed")
	}
	if _, err := jobForTest().quickAction(Payload{Mode: "trim", Paths: []string{source}, Destination: dir, StartSeconds: 1, EndSeconds: 3}); err == nil {
		t.Fatal("out of range accepted")
	}
	fake := filepath.Join(dir, "fake.mp4")
	os.WriteFile(fake, before, 0600)
	if _, err := inspectQuickMedia(jobForTest().ctx, fake); err == nil {
		t.Fatal("audio disguised as video accepted")
	}
}

func TestQuickVideoRotation(t *testing.T) {
	cwd, _ := os.Getwd()
	t.Setenv("PATH", filepath.Join(cwd, "tools")+string(os.PathListSeparator)+os.Getenv("PATH"))
	if _, err := toolPath("ffmpeg"); err != nil {
		t.Skip(err)
	}
	dir := t.TempDir()
	source := filepath.Join(dir, "clip.mp4")
	if _, err := runTool("ffmpeg", []string{"-nostdin", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=120x80:duration=1:rate=5", "-c:v", "libx264", "-pix_fmt", "yuv420p", source}, ""); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(source)
	result, err := jobForTest().quickAction(Payload{Mode: "rotate", Paths: []string{source}, Destination: dir, Angle: -90})
	if err != nil {
		t.Fatal(err)
	}
	output, err := runTool("ffprobe", []string{"-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", result.([]string)[0]}, "")
	if err != nil || strings.TrimSpace(output) != "80,120" {
		t.Fatal(output, err)
	}
	after, _ := os.ReadFile(source)
	if !bytes.Equal(before, after) {
		t.Fatal("original video changed")
	}
}
