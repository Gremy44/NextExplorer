package main

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"time"
)

func quickKind(path string) string {
	if kind := conversionKind(path); kind != "" {
		return kind
	}
	if slices.Contains([]string{".mp3", ".flac", ".wav", ".ogg", ".opus", ".m4a", ".aac"}, strings.ToLower(filepath.Ext(path))) {
		return "audio"
	}
	return ""
}

type quickMediaInfo struct {
	Duration float64 `json:"duration"`
	Kind     string  `json:"kind"`
	Expected Entry   `json:"expected"`
}

func inspectQuickMedia(ctx context.Context, path string) (quickMediaInfo, error) {
	entry, err := statEntry(path)
	kind := quickKind(path)
	info := quickMediaInfo{Expected: entry, Kind: kind}
	if err != nil || entry.Type != "file" || (kind != "video" && kind != "audio") {
		return info, fmt.Errorf("fichier audio ou vidéo requis")
	}
	probe, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	raw, err := commandOutput(probe, "ffprobe", []string{"-v", "error", "-show_entries", "stream=codec_type:stream_disposition=attached_pic:format=duration", "-of", "json", path}, "")
	if err != nil {
		return info, err
	}
	var parsed struct {
		Streams []struct {
			Type        string `json:"codec_type"`
			Disposition struct {
				Attached int `json:"attached_pic"`
			} `json:"disposition"`
		} `json:"streams"`
		Format struct {
			Duration string `json:"duration"`
		} `json:"format"`
	}
	if json.Unmarshal([]byte(raw), &parsed) != nil {
		return info, fmt.Errorf("média illisible")
	}
	found := false
	for _, stream := range parsed.Streams {
		if stream.Type == kind && (kind != "video" || stream.Disposition.Attached == 0) {
			found = true
		}
	}
	info.Duration, err = strconv.ParseFloat(parsed.Format.Duration, 64)
	if !found || err != nil || info.Duration <= 0 || math.IsNaN(info.Duration) || math.IsInf(info.Duration, 0) {
		return info, fmt.Errorf("durée ou piste média indisponible")
	}
	current, err := statEntry(path)
	if err != nil || current != entry {
		return info, fmt.Errorf("source modifiée pendant l’analyse")
	}
	return info, nil
}
func validateQuickAction(p Payload) error {
	if len(p.Paths) == 0 || len(p.Paths) > 200 {
		return fmt.Errorf("de 1 à 200 fichiers requis")
	}
	kind := quickKind(p.Paths[0])
	if p.Mode == "rotate" {
		if (kind != "image" && kind != "video") || (p.Angle != 90 && p.Angle != -90) {
			return fmt.Errorf("rotation réservée aux images et vidéos, de 90 degrés")
		}
	} else if p.Mode == "trim" {
		if len(p.Paths) != 1 || (kind != "video" && kind != "audio") || math.IsNaN(p.StartSeconds) || math.IsInf(p.StartSeconds, 0) || math.IsNaN(p.EndSeconds) || math.IsInf(p.EndSeconds, 0) || p.StartSeconds < 0 || p.EndSeconds <= p.StartSeconds || p.EndSeconds-p.StartSeconds > 3600 {
			return fmt.Errorf("intervalle invalide : un média et un extrait de 1 heure maximum")
		}
	} else {
		return fmt.Errorf("action rapide inconnue")
	}
	for _, path := range p.Paths {
		entry, err := statEntry(path)
		if err != nil || entry.Type != "file" || quickKind(path) != kind {
			return fmt.Errorf("sélection homogène de fichiers requis, sans dossier ni lien")
		}
	}
	return nil
}
func (j *Job) quickAction(p Payload) (any, error) {
	if err := validateQuickAction(p); err != nil {
		return nil, err
	}
	kind := quickKind(p.Paths[0])
	if kind == "video" {
		encoders, err := conversionEncoders(j.ctx)
		if err != nil {
			return nil, err
		}
		if !slices.Contains(encoders, "libx264") {
			return nil, fmt.Errorf("encodeur H.264 absent de FFmpeg")
		}
	}
	dir, err := validPath(p.Destination)
	if err != nil {
		return nil, err
	}
	if entry, err := statEntry(dir); err != nil || entry.Type != "directory" {
		return nil, fmt.Errorf("dossier de destination requis")
	}
	sources := make([]Entry, len(p.Paths))
	for index, path := range p.Paths {
		if err = j.check(); err != nil {
			return nil, err
		}
		if kind == "image" {
			source, err := inspectConversion(j.ctx, path, kind)
			if err != nil {
				return nil, err
			}
			sources[index] = source.entry
		} else {
			info, err := inspectQuickMedia(j.ctx, path)
			if err != nil {
				return nil, err
			}
			sources[index] = info.Expected
			if p.Mode == "trim" && p.EndSeconds > info.Duration+.05 {
				return nil, fmt.Errorf("fin au-delà de la durée du média")
			}
		}
		if len(j.expected) > index && sources[index] != j.expected[index] {
			return nil, fmt.Errorf("source modifiée avant traitement")
		}
	}
	done := append([]string{}, j.completed...)
	j.mu.Lock()
	j.Total = int64(len(p.Paths))
	j.mu.Unlock()
	for index := j.next; index < len(p.Paths); index++ {
		if err = j.check(); err != nil {
			return done, err
		}
		source := sources[index]
		if err = j.checkpoint(index, true, done); err != nil {
			return done, err
		}
		ext, suffix := "mp4", "-rotation"
		if kind == "image" {
			ext = "png"
		}
		if kind == "audio" {
			ext = "m4a"
		}
		if p.Mode == "trim" {
			suffix = "-extrait"
		}
		target := filepath.Join(dir, strings.TrimSuffix(source.Name, filepath.Ext(source.Name))+suffix+"."+ext)
		if _, err = os.Lstat(target); !os.IsNotExist(err) {
			target = uniquePath(target)
		}
		file, err := os.CreateTemp(dir, ".nextexplorer-quick-*."+ext)
		if err != nil {
			return done, err
		}
		tmp := file.Name()
		file.Close()
		name := "ffmpeg"
		args := []string{"-nostdin", "-hide_banner", "-loglevel", "error", "-y"}
		if kind == "image" {
			name = "magick"
			args = []string{imageCoder(source.Path) + ":" + source.Path + "[0]", "-auto-orient", "-rotate", strconv.Itoa(p.Angle), tmp}
		} else {
			if p.Mode == "trim" {
				args = append(args, "-ss", strconv.FormatFloat(p.StartSeconds, 'f', 3, 64))
			}
			args = append(args, "-i", source.Path)
			if p.Mode == "trim" {
				args = append(args, "-t", strconv.FormatFloat(p.EndSeconds-p.StartSeconds, 'f', 3, 64))
			}
			if kind == "video" {
				args = append(args, "-map", "0:v:0", "-map", "0:a:0?", "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-threads", "2", "-pix_fmt", "yuv420p")
				filter := "scale=trunc(iw/2)*2:trunc(ih/2)*2"
				if p.Mode == "rotate" {
					transpose := "1"
					if p.Angle < 0 {
						transpose = "2"
					}
					filter = "transpose=" + transpose + "," + filter
				}
				args = append(args, "-vf", filter)
			} else {
				args = append(args, "-vn", "-map", "0:a:0")
			}
			args = append(args, "-c:a", "aac", "-b:a", "192k", "-map_metadata", "-1", "-map_chapters", "-1", "-movflags", "+faststart", tmp)
		}
		_, err = commandOutput(j.ctx, name, args, "")
		if err == nil {
			current, statErr := statEntry(source.Path)
			if statErr != nil || current != source {
				err = fmt.Errorf("source modifiée pendant le traitement")
			}
		}
		if err == nil {
			err = j.check()
		}
		if err == nil {
			err = publishFile(tmp, target)
		}
		os.Remove(tmp)
		if err != nil {
			return done, err
		}
		done = append(done, target)
		j.progress(1)
		if err = j.checkpoint(index+1, false, done); err != nil {
			return done, err
		}
	}
	return done, nil
}
