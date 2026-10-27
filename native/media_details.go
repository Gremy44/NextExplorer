package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"
)

type mediaTrack struct {
	Index int               `json:"index"`
	Type  string            `json:"codec_type"`
	Codec string            `json:"codec_name"`
	Tags  map[string]string `json:"tags"`
}

func probeTracks(path string) ([]mediaTrack, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	raw, err := commandOutput(ctx, "ffprobe", []string{"-v", "error", "-show_entries", "stream=index,codec_type,codec_name:stream_tags=language,title", "-of", "json", path}, "")
	if err != nil {
		return nil, err
	}
	var data struct {
		Streams []mediaTrack `json:"streams"`
	}
	if err = json.Unmarshal([]byte(raw), &data); err != nil {
		return nil, err
	}
	if len(data.Streams) > 128 {
		return nil, fmt.Errorf("Trop de pistes média")
	}
	return data.Streams, nil
}
func subtitleCodec(codec string) bool {
	return strings.Contains("|subrip|webvtt|ass|ssa|mov_text|text|", "|"+codec+"|")
}
func matchingSubtitle(video, name string) bool {
	if validName(name) != nil {
		return false
	}
	ext := strings.ToLower(filepath.Ext(name))
	if ext != ".srt" && ext != ".vtt" {
		return false
	}
	stem := strings.ToLower(strings.TrimSuffix(filepath.Base(video), filepath.Ext(video)))
	base := strings.ToLower(strings.TrimSuffix(name, filepath.Ext(name)))
	return base == stem || strings.HasPrefix(base, stem+".")
}
func mediaDetails(p Payload, subtitle bool) (any, error) {
	entry, err := statEntry(p.Path)
	if err != nil {
		return nil, err
	}
	if p.Expected == nil || *p.Expected != entry || entry.Type != "file" || quickKind(entry.Path) == "" {
		return nil, fmt.Errorf("Média ordinaire inchangé requis")
	}
	if subtitle {
		var data []byte
		if p.Mode == "embedded" {
			tracks, e := probeTracks(entry.Path)
			if e != nil {
				return nil, e
			}
			allowed := false
			for _, t := range tracks {
				if t.Index == p.Offset && t.Type == "subtitle" && subtitleCodec(t.Codec) {
					allowed = true
				}
			}
			if !allowed {
				return nil, fmt.Errorf("Piste de sous-titres textuelle requise")
			}
			engine, e := toolPath("ffmpeg")
			if e != nil {
				return nil, e
			}
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			c := exec.CommandContext(ctx, engine, "-nostdin", "-v", "error", "-i", entry.Path, "-map", fmt.Sprintf("0:%d", p.Offset), "-f", "webvtt", "pipe:1")
			quiet(c)
			out := &strictBuffer{limit: 128 << 10}
			var stderr limitedBuffer
			c.Stdout = out
			c.Stderr = &stderr
			if err = c.Run(); err != nil {
				return nil, fmt.Errorf("Sous-titres non extractibles dans la limite de 128 Kio / 15 s")
			}
			data = []byte(out.String())
		} else {
			if !matchingSubtitle(entry.Path, p.Name) {
				return nil, fmt.Errorf("Sous-titre voisin SRT ou VTT requis")
			}
			path := filepath.Join(filepath.Dir(entry.Path), p.Name)
			s, e := os.Lstat(path)
			if e != nil {
				return nil, e
			}
			if !s.Mode().IsRegular() || s.Size() > 128<<10 {
				return nil, fmt.Errorf("Sous-titre ordinaire de 128 Kio maximum requis")
			}
			f, e := os.Open(path)
			if e != nil {
				return nil, e
			}
			defer f.Close()
			opened, e := f.Stat()
			if e != nil || !os.SameFile(s, opened) {
				return nil, fmt.Errorf("Sous-titre remplacé")
			}
			data, err = io.ReadAll(io.LimitReader(f, (128<<10)+1))
			if err != nil {
				return nil, err
			}
			after, e := os.Lstat(path)
			if e != nil || !os.SameFile(s, after) || s.Size() != after.Size() || !s.ModTime().Equal(after.ModTime()) {
				return nil, fmt.Errorf("Sous-titre modifié pendant la lecture")
			}
		}
		after, e := statEntry(entry.Path)
		if e != nil || after != entry || len(data) > 128<<10 || !utf8.Valid(data) {
			return nil, fmt.Errorf("Média modifié ou sous-titres hors limites / non UTF-8")
		}
		return M{"text": string(data)}, nil
	}
	tracks, probeError := probeTracks(entry.Path)
	note := ""
	if probeError != nil {
		note = "Diagnostic des codecs indisponible : FFprobe requis, ou média non analysable"
		tracks = []mediaTrack{}
	}
	f, err := os.Open(filepath.Dir(entry.Path))
	if err != nil {
		return nil, err
	}
	defer f.Close()
	neighbors, readErr := f.ReadDir(2001)
	if readErr != nil && readErr != io.EOF {
		return nil, readErr
	}
	subtitles := []M{}
	for _, n := range neighbors[:min(len(neighbors), 2000)] {
		if matchingSubtitle(entry.Path, n.Name()) && n.Type().IsRegular() && len(subtitles) < 12 {
			subtitles = append(subtitles, M{"name": n.Name(), "mode": "neighbor"})
		}
	}
	for _, t := range tracks {
		if t.Type == "subtitle" {
			if subtitleCodec(t.Codec) && len(subtitles) < 24 {
				subtitles = append(subtitles, M{"name": fmt.Sprintf("Piste %d · %s", t.Index, t.Tags["language"]), "mode": "embedded", "index": t.Index})
			} else if !subtitleCodec(t.Codec) {
				note += " Sous-titres graphiques non pris en charge (OCR nécessaire)."
			}
		}
	}
	if len(neighbors) > 2000 {
		note += " Recherche des sous-titres limitée aux 2 000 premières entrées du dossier."
	}
	after, e := statEntry(entry.Path)
	if e != nil || after != entry {
		return nil, fmt.Errorf("Média modifié")
	}
	return M{"streams": tracks, "subtitles": subtitles, "note": note}, nil
}
