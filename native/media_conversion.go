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

func conversionKind(path string) string {
	if rasterImage(path) {
		return "image"
	}
	if strings.Contains("|.mp4|.m4v|.mkv|.webm|.mov|.avi|.mpg|.mpeg|.wmv|.m2ts|.mts|.ts|.ogv|.3gp|", "|"+strings.ToLower(filepath.Ext(path))+"|") {
		return "video"
	}
	return ""
}
func imageCoder(path string) string {
	return map[string]string{".jpg": "JPEG", ".jpeg": "JPEG", ".png": "PNG", ".webp": "WEBP", ".avif": "AVIF", ".gif": "GIF", ".bmp": "BMP", ".tif": "TIFF", ".tiff": "TIFF", ".heic": "HEIC", ".heif": "HEIC"}[strings.ToLower(filepath.Ext(path))]
}
func conversionCodecs(format string) []string {
	switch format {
	case "mp4":
		return []string{"libx264", "libx265", "libsvtav1"}
	case "webm":
		return []string{"libvpx-vp9", "libsvtav1"}
	case "mkv":
		return []string{"libx264", "libx265", "libvpx-vp9", "libsvtav1"}
	case "mov":
		return []string{"libx264", "libx265"}
	}
	return nil
}

func parseConversionEncoders(output string) []string {
	encoders := []string{}
	for _, line := range strings.Split(output, "\n") {
		fields := strings.Fields(line)
		if len(fields) >= 2 && strings.HasPrefix(fields[0], "V") && slices.Contains(conversionCodecs("mkv"), fields[1]) && !slices.Contains(encoders, fields[1]) {
			encoders = append(encoders, fields[1])
		}
	}
	return encoders
}
func conversionEncoders(ctx context.Context) ([]string, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	output, err := commandOutput(ctx, "ffmpeg", []string{"-hide_banner", "-encoders"}, "")
	if err != nil {
		return nil, err
	}
	return parseConversionEncoders(output), nil
}
func validateConversion(p Payload) (string, error) {
	if len(p.Paths) == 0 || len(p.Paths) > 200 {
		return "", fmt.Errorf("sélectionnez de 1 à 200 images ou vidéos")
	}
	kind := conversionKind(p.Paths[0])
	if kind == "" {
		return "", fmt.Errorf("conversion réservée aux images matricielles et aux vidéos ; documents et audio seuls non pris en charge")
	}
	for _, path := range p.Paths {
		entry, err := statEntry(path)
		if err != nil || entry.Type != "file" || conversionKind(path) != kind {
			return "", fmt.Errorf("lot incompatible : sélectionnez uniquement des images ou uniquement des vidéos, sans dossier ni lien")
		}
	}
	if p.Mode != "" && p.Mode != "convert" && p.Mode != "remux" {
		return "", fmt.Errorf("mode de conversion invalide")
	}
	if p.Width < 0 || p.Quality < 0 || p.Quality > 100 || p.TargetMB < 0 || p.TargetMB > 100000 || p.Bitrate < 0 || p.Bitrate > 512 || (p.Bitrate != 0 && p.Bitrate < 32) {
		return "", fmt.Errorf("réglages de conversion hors limites")
	}
	if kind == "image" {
		if !strings.Contains("|jpg|jpeg|png|webp|avif|tiff|bmp|gif|", "|"+p.Format+"|") || p.Width > 20000 {
			return "", fmt.Errorf("format ou dimensions d’image non pris en charge")
		}
		if p.Mode == "remux" || p.Codec != "" || p.TargetMB != 0 || p.Bitrate != 0 || p.Normalize || p.VideoQuality != "" {
			return "", fmt.Errorf("les options vidéo et audio ne s’appliquent pas aux images")
		}
	} else {
		codecs := conversionCodecs(p.Format)
		if len(codecs) == 0 || p.Width > 7680 || p.Width == 1 {
			return "", fmt.Errorf("format ou dimensions vidéo non pris en charge")
		}
		if p.Mode != "remux" && p.Codec != "" && !slices.Contains(codecs, p.Codec) {
			return "", fmt.Errorf("encodage incompatible avec le conteneur vidéo choisi")
		}
		if p.VideoQuality != "" && !slices.Contains([]string{"high", "balanced", "small"}, p.VideoQuality) {
			return "", fmt.Errorf("qualité vidéo invalide")
		}
	}
	return kind, nil
}

type conversionSource struct {
	entry         Entry
	videoIndex    int
	duration      float64
	width, height int64
}

func inspectConversion(ctx context.Context, path, kind string) (conversionSource, error) {
	entry, err := statEntry(path)
	result := conversionSource{entry: entry}
	if err != nil || entry.Type != "file" {
		return result, fmt.Errorf("fichier source indisponible")
	}
	before, err := os.Lstat(path)
	if err != nil {
		return result, err
	}
	probe, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	if kind == "image" {
		if entry.Size <= 0 || entry.Size > imageFileLimit {
			return result, fmt.Errorf("image source limitée à 256 Mio")
		}
		dimensions, err := imageOutput(probe, []string{"-ping", imageCoder(path) + ":" + path + "[0]", "-format", "%w %h", "info:"}, 128)
		if err != nil {
			return result, err
		}
		var width, height int64
		if _, err = fmt.Sscanf(string(dimensions), "%d %d", &width, &height); err != nil || width < 1 || height < 1 || width > 100000 || height > 100000 || width*height > 100000000 {
			return result, fmt.Errorf("image limitée à 100 mégapixels")
		}
		result.width, result.height = width, height
	} else {
		raw, err := commandOutput(probe, "ffprobe", []string{"-v", "error", "-show_entries", "stream=index,codec_type,width,height:stream_disposition=attached_pic:format=duration", "-of", "json", path}, "")
		if err != nil {
			return result, err
		}
		var info struct {
			Streams []struct {
				Index       int    `json:"index"`
				Type        string `json:"codec_type"`
				Width       int    `json:"width"`
				Height      int    `json:"height"`
				Disposition struct {
					Attached int `json:"attached_pic"`
				} `json:"disposition"`
			} `json:"streams"`
			Format struct {
				Duration string `json:"duration"`
			} `json:"format"`
		}
		if json.Unmarshal([]byte(raw), &info) != nil {
			return result, fmt.Errorf("média vidéo illisible")
		}
		found := false
		for _, stream := range info.Streams {
			if stream.Type == "video" && stream.Disposition.Attached == 0 && stream.Width >= 2 && stream.Height >= 2 {
				result.videoIndex = stream.Index
				found = true
				break
			}
		}
		if !found {
			return result, fmt.Errorf("aucune piste vidéo valide ; une piste audio ou une pochette ne suffit pas")
		}
		result.duration, _ = strconv.ParseFloat(info.Format.Duration, 64)
	}
	after, err := os.Lstat(path)
	if err != nil || !os.SameFile(before, after) || before.Size() != after.Size() || !before.ModTime().Equal(after.ModTime()) {
		return result, fmt.Errorf("source modifiée pendant le contrôle")
	}
	return result, nil
}
func conversionArgs(p Payload, source conversionSource, kind, target string) (string, []string, error) {
	if kind == "image" {
		args := []string{imageCoder(source.entry.Path) + ":" + source.entry.Path + "[0]", "-auto-orient"}
		if p.Width > 0 {
			args = append(args, "-resize", fmt.Sprintf("%dx>", p.Width))
		}
		if p.Format == "jpg" || p.Format == "jpeg" {
			args = append(args, "-background", "white", "-alpha", "remove", "-alpha", "off")
		}
		if p.Strip {
			args = append(args, "-strip")
		}
		if slices.Contains([]string{"jpg", "jpeg", "webp", "avif"}, p.Format) {
			quality := p.Quality
			if quality == 0 {
				quality = 85
			}
			args = append(args, "-quality", strconv.Itoa(quality))
		}
		if p.Format == "tiff" {
			args = append(args, "-compress", "LZW")
		}
		return "magick", append(args, target), nil
	}
	args := []string{"-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", source.entry.Path, "-map", fmt.Sprintf("0:%d", source.videoIndex), "-map", "0:a?", "-sn", "-dn"}
	if p.Mode == "remux" {
		args = append(args, "-c", "copy")
	} else {
		codec := p.Codec
		if codec == "" {
			codec = conversionCodecs(p.Format)[0]
		}
		args = append(args, "-c:v", codec)
		if p.Width > 0 {
			args = append(args, "-vf", fmt.Sprintf("scale='trunc(min(iw,%d)/2)*2':-2", p.Width))
		} else {
			args = append(args, "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2")
		}
		if p.TargetMB > 0 {
			if source.duration <= 0 || math.IsNaN(source.duration) || math.IsInf(source.duration, 0) {
				return "", nil, fmt.Errorf("durée indisponible pour la taille cible")
			}
			rate := int(float64(p.TargetMB)*8*1024*1024/source.duration*.94) - 192000
			args = append(args, "-b:v", strconv.Itoa(max(rate, 32000)))
		} else {
			quality := map[string]int{"high": 18, "balanced": 23, "small": 28}
			if codec == "libx265" {
				quality = map[string]int{"high": 20, "balanced": 26, "small": 30}
			}
			if codec == "libvpx-vp9" || codec == "libsvtav1" {
				quality = map[string]int{"high": 24, "balanced": 32, "small": 40}
			}
			level := p.VideoQuality
			if level == "" {
				level = "balanced"
			}
			args = append(args, "-crf", strconv.Itoa(quality[level]))
			if codec == "libvpx-vp9" {
				args = append(args, "-b:v", "0")
			}
		}
		if codec == "libvpx-vp9" {
			args = append(args, "-cpu-used", "4")
		}
		if codec == "libsvtav1" {
			args = append(args, "-preset", "8")
		}
		if codec == "libx265" && (p.Format == "mp4" || p.Format == "mov") {
			args = append(args, "-tag:v", "hvc1")
		}
		audioCodec := "aac"
		if p.Format == "webm" {
			audioCodec = "libopus"
		}
		bitrate := p.Bitrate
		if bitrate == 0 {
			bitrate = 192
		}
		args = append(args, "-pix_fmt", "yuv420p", "-c:a", audioCodec, "-b:a", fmt.Sprintf("%dk", bitrate))
		if p.Normalize {
			args = append(args, "-af", "loudnorm")
		}
	}
	if p.Strip {
		args = append(args, "-map_metadata", "-1", "-map_chapters", "-1")
	}
	if p.Format == "mp4" || p.Format == "mov" {
		args = append(args, "-movflags", "+faststart")
	}
	return "ffmpeg", append(args, target), nil
}

func (j *Job) convert(p Payload) (any, error) {
	kind, err := validateConversion(p)
	if err != nil {
		return nil, err
	}
	if kind == "video" && p.Mode != "remux" {
		encoders, err := conversionEncoders(j.ctx)
		if err != nil {
			return nil, err
		}
		if p.Codec == "" {
			for _, codec := range conversionCodecs(p.Format) {
				if slices.Contains(encoders, codec) {
					p.Codec = codec
					break
				}
			}
		}
		if !slices.Contains(encoders, p.Codec) {
			return nil, fmt.Errorf("encodeur indisponible dans FFmpeg : choisissez un encodage installé")
		}
	}
	dir, err := validPath(p.Destination)
	if err != nil {
		return nil, err
	}
	folder, err := os.Stat(dir)
	if err != nil || !folder.IsDir() {
		return nil, fmt.Errorf("dossier de destination requis")
	}
	done := append([]string{}, j.completed...)
	j.mu.Lock()
	j.Total = int64(len(p.Paths))
	j.mu.Unlock()
	sources := make(map[int]conversionSource)
	// Inspect every source header before publishing the first copy.
	for index := j.next; index < len(p.Paths); index++ {
		if err := j.check(); err != nil {
			return done, err
		}
		source, err := inspectConversion(j.ctx, p.Paths[index], kind)
		if err != nil {
			return done, fmt.Errorf("%s : %w", filepath.Base(p.Paths[index]), err)
		}
		if len(j.expected) > index && source.entry != j.expected[index] {
			return done, fmt.Errorf("source modifiée avant conversion")
		}
		sources[index] = source
	}
	for index := j.next; index < len(p.Paths); index++ {
		if err := j.check(); err != nil {
			return done, err
		}
		source := sources[index]
		current, err := statEntry(source.entry.Path)
		if err != nil || current != source.entry {
			return done, fmt.Errorf("source modifiée avant conversion")
		}
		if err := j.checkpoint(index, true, done); err != nil {
			return done, err
		}
		target := filepath.Join(dir, strings.TrimSuffix(filepath.Base(source.entry.Path), filepath.Ext(source.entry.Path))+"."+p.Format)
		if _, err := os.Lstat(target); !os.IsNotExist(err) {
			target = uniquePath(target)
		}
		temp, err := os.CreateTemp(dir, ".nextexplorer-convert-*."+p.Format)
		if err != nil {
			return done, err
		}
		tmp := temp.Name()
		temp.Close()
		name, args, err := conversionArgs(p, source, kind, tmp)
		if err == nil {
			_, err = commandOutput(j.ctx, name, args, "")
		}
		if err == nil {
			current, statErr := statEntry(source.entry.Path)
			if statErr != nil || current != source.entry {
				err = fmt.Errorf("source modifiée pendant la conversion")
			}
		}
		if err == nil {
			if _, exists := os.Lstat(target); !os.IsNotExist(exists) {
				err = fmt.Errorf("destination apparue pendant la conversion")
			} else {
				err = publishFile(tmp, target)
			}
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
