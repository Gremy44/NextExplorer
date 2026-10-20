package main

import (
	"crypto/sha256"
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"testing"
)

func TestParseConversionEncoders(t *testing.T) {
	list := parseConversionEncoders(" V....D libx264 encoder\n V....D libx265 encoder\n A..... libsvtav1 wrong-type\n V....D h264_nvenc GPU\n V....D libx264 duplicate\n")
	if !slices.Equal(list, []string{"libx264", "libx265"}) {
		t.Fatal(list)
	}
}

func TestConversionRejectsUnsupportedBatchesBeforeQueuing(t *testing.T) {
	dir := t.TempDir()
	image, video, text, audio := filepath.Join(dir, "photo.png"), filepath.Join(dir, "film.mp4"), filepath.Join(dir, "notes.txt"), filepath.Join(dir, "sound.mp3")
	for _, path := range []string{image, video, text, audio} {
		put(t, path, "fixture")
	}
	cases := []Payload{
		{Paths: []string{text}, Format: "png"}, {Paths: []string{audio}, Format: "mp4"},
		{Paths: []string{dir}, Format: "png"}, {Paths: []string{image, text}, Format: "png"},
		{Paths: []string{image, video}, Format: "mp4"}, {Paths: []string{image}, Format: "svg"},
		{Paths: []string{image}, Format: "mp3"}, {Paths: []string{video}, Format: "jpg"},
		{Paths: []string{video}, Format: "webm", Codec: "libx264"},
		{Paths: []string{image}, Format: "jpg", Codec: "libx264"},
		{Paths: []string{image}, Format: "jpg", Mode: "remux"},
		{Paths: []string{image}, Format: "jpg", Normalize: true},
		{Paths: []string{video}, Format: "mp4", VideoQuality: "invalid"},
		{Paths: []string{video}, Format: "mp4", Width: 7681},
		{Paths: []string{image}, Format: "jpg", Width: -1},
		{Paths: []string{video}, Format: "mp4", TargetMB: -1},
		{Paths: []string{video}, Format: "mp4", Width: 1},
		{Paths: []string{video}, Format: "mp4", Bitrate: 1},
	}
	h := durableHost(t)
	for _, payload := range cases {
		payload.Destination = t.TempDir()
		if _, err := h.startJob("convert", payload); err == nil {
			t.Fatalf("invalid batch queued: %+v", payload)
		}
		if len(h.jobs) != 0 {
			t.Fatal("rejected conversion left a task")
		}
		files, _ := os.ReadDir(payload.Destination)
		if len(files) != 0 {
			t.Fatal("rejected conversion wrote files")
		}
	}
}
func conversionEngines(t *testing.T) {
	t.Helper()
	cwd, _ := os.Getwd()
	if _, err := os.Stat(filepath.Join(cwd, "tools", "ffmpeg.exe")); err != nil {
		t.Skip("portable engines unavailable")
	}
	t.Setenv("PATH", filepath.Join(cwd, "tools")+string(os.PathListSeparator)+os.Getenv("PATH"))
}
func TestConversionImagePreflightAndCopies(t *testing.T) {
	conversionEngines(t)
	source := filepath.Join(t.TempDir(), "original.png")
	data, err := os.ReadFile("../public/icon128.png")
	if err != nil {
		t.Fatal(err)
	}
	os.WriteFile(source, data, 0600)
	dest := t.TempDir()
	j := jobForTest()
	fake := filepath.Join(t.TempDir(), "invalid.png")
	put(t, fake, "not an image")
	if _, err := j.convert(Payload{Paths: []string{source, fake}, Destination: dest, Format: "jpg", Quality: 85}); err == nil {
		t.Fatal("corrupt second source accepted")
	}
	files, _ := os.ReadDir(dest)
	if len(files) != 0 {
		t.Fatal("partial publication before batch validation", files)
	}
	for range 2 {
		if _, err := j.convert(Payload{Paths: []string{source}, Destination: dest, Format: "jpg", Width: 64, Quality: 85}); err != nil {
			t.Fatal(err)
		}
	}
	for _, name := range []string{"original.jpg", "original (1).jpg"} {
		output, err := commandOutput(j.ctx, "magick", []string{filepath.Join(dest, name), "-format", "%m %w %h", "info:"}, "")
		if err != nil || output != "JPEG 64 64" {
			t.Fatal(output, err)
		}
	}
	after, _ := os.ReadFile(source)
	if sha256.Sum256(data) != sha256.Sum256(after) {
		t.Fatal("original altered")
	}
}
func TestVideoConversionContainerAudioAndNoUpscale(t *testing.T) {
	conversionEngines(t)
	source := filepath.Join(t.TempDir(), "source.mp4")
	j := jobForTest()
	if _, err := commandOutput(j.ctx, "ffmpeg", []string{"-nostdin", "-f", "lavfi", "-i", "color=c=blue:s=192x128:d=0.4", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", source}, ""); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(source)
	dest := t.TempDir()
	installed, err := conversionEncoders(j.ctx)
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		format, codec, expected string
		target                  int
	}{
		{"mp4", "", "h264", 0}, {"webm", "", "vp9", 0},
		{"mp4", "libx265", "hevc", 0}, {"mp4", "libsvtav1", "av1", 0},
		{"webm", "libsvtav1", "av1", 0}, {"mkv", "libvpx-vp9", "vp9", 0},
		{"mov", "libx264", "h264", 1},
	}
	for _, test := range cases {
		format, dest := test.format, t.TempDir()
		if test.codec != "" && !slices.Contains(installed, test.codec) {
			if _, err := j.convert(Payload{Paths: []string{source}, Destination: dest, Format: format, Codec: test.codec}); err == nil {
				t.Fatal("unavailable encoder accepted", test.codec)
			}
			files, _ := os.ReadDir(dest)
			if len(files) != 0 {
				t.Fatal("unavailable encoder left output")
			}
			continue
		}
		if _, err := j.convert(Payload{Paths: []string{source}, Destination: dest, Format: format, Codec: test.codec, Width: 1280, VideoQuality: "balanced", TargetMB: test.target}); err != nil {
			t.Fatal(format, err)
		}
		out, err := commandOutput(j.ctx, "ffprobe", []string{"-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height", "-of", "json", filepath.Join(dest, "source."+format)}, "")
		if err != nil {
			t.Fatal(err)
		}
		var info struct {
			Streams []struct {
				Type   string `json:"codec_type"`
				Codec  string `json:"codec_name"`
				Width  int    `json:"width"`
				Height int    `json:"height"`
			} `json:"streams"`
		}
		if json.Unmarshal([]byte(out), &info) != nil || len(info.Streams) != 2 {
			t.Fatal(out)
		}
		video, audio := info.Streams[0], info.Streams[1]
		expectedVideo, expectedAudio := test.expected, "aac"
		if format == "webm" {
			expectedAudio = "opus"
		}
		if video.Width != 192 || video.Height != 128 || video.Codec != expectedVideo || audio.Codec != expectedAudio {
			t.Fatal(out)
		}
	}
	fake := filepath.Join(t.TempDir(), "sound.mp4")
	if _, err := commandOutput(j.ctx, "ffmpeg", []string{"-nostdin", "-f", "lavfi", "-i", "sine=duration=0.1", "-c:a", "aac", fake}, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := j.convert(Payload{Paths: []string{fake}, Destination: dest, Format: "mp4"}); err == nil {
		t.Fatal("audio disguised as MP4 accepted")
	}
	after, _ := os.ReadFile(source)
	if sha256.Sum256(before) != sha256.Sum256(after) {
		t.Fatal("video original altered")
	}
}
