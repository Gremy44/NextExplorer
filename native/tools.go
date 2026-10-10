package main

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

func toolPath(name string) (string, error) {
	exe, _ := os.Executable()
	ext := ""
	if runtime.GOOS == "windows" {
		ext = ".exe"
	}
	p := filepath.Join(filepath.Dir(exe), "tools", name+ext)
	if s, e := os.Stat(p); e == nil && !s.IsDir() {
		return p, nil
	}
	p, e := exec.LookPath(name)
	if e != nil {
		return "", fmt.Errorf("%s absent : installer le moteur dans native/tools ou dans PATH", name)
	}
	return p, nil
}
func toolCapabilities() M {
	m := M{}
	for _, n := range []string{"ffmpeg", "ffprobe", "magick", "exiftool", "7z", "yt-dlp", "git", "code"} {
		_, e := toolPath(n)
		m[n] = e == nil
	}
	return m
}

type limitedBuffer struct{ bytes.Buffer }

func (b *limitedBuffer) Write(p []byte) (int, error) {
	n := len(p)
	if b.Len() < 256*1024 {
		b.Buffer.Write(p[:min(n, 256*1024-b.Len())])
	}
	return n, nil
}
func commandOutput(ctx context.Context, name string, args []string, dir string) (string, error) {
	p, e := toolPath(name)
	if e != nil {
		return "", e
	}
	c := exec.CommandContext(ctx, p, args...)
	c.Dir = dir
	if name == "magick" {
		exe, _ := os.Executable()
		security := filepath.Join(filepath.Dir(exe), "security")
		if _, err := os.Stat(security); err == nil {
			c.Env = append(os.Environ(), "MAGICK_CONFIGURE_PATH="+security)
		}
	}
	quiet(c)
	var out limitedBuffer
	var errors limitedBuffer
	c.Stdout = &out
	c.Stderr = &errors
	if e = c.Run(); e != nil {
		return "", fmt.Errorf("%s : %s %s (%v)", name, out.String(), errors.String(), e)
	}
	return out.String(), nil
}
func runTool(name string, args []string, dir string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	return commandOutput(ctx, name, args, dir)
}
func metadata(path string) (any, error) {
	a, e := validPath(path)
	if e != nil {
		return nil, e
	}
	out, e := runTool("exiftool", []string{"-json", "-n", a}, "")
	if e != nil {
		return nil, e
	}
	var data any
	e = json.Unmarshal([]byte(out), &data)
	return data, e
}
func metadataTags(path string) (map[string]string, error) {
	v, e := metadata(path)
	if e != nil {
		return nil, e
	}
	out := map[string]string{}
	rows, ok := v.([]any)
	if !ok || len(rows) == 0 {
		return out, nil
	}
	for k, v := range rows[0].(map[string]any) {
		out[k] = fmt.Sprint(v)
	}
	return out, nil
}
func (j *Job) editMetadata(p Payload) (any, error) {
	allowed := map[string]bool{"Artist": true, "Title": true, "Album": true, "Track": true, "Genre": true, "Year": true}
	done := []string{}
	for _, path := range p.Paths {
		if e := j.check(); e != nil {
			return done, e
		}
		a, e := validPath(path)
		if e != nil {
			return done, e
		}
		args := []string{}
		if p.Strip {
			args = append(args, "-all=")
		}
		for key, value := range p.Tags {
			if !allowed[key] {
				return done, fmt.Errorf("tag non autorisé : %s", key)
			}
			args = append(args, "-"+key+"="+value)
		}
		if len(args) == 0 {
			return done, fmt.Errorf("aucun changement demandé")
		}
		if strings.Contains("|.mp3|.flac|.ogg|.opus|.m4a|.wav|.aac|", "|"+strings.ToLower(filepath.Ext(a))+"|") {
			if e = j.editAudioTags(a, p); e != nil {
				return done, e
			}
			done = append(done, a)
			j.progress(1)
			continue
		}
		args = append(args, a)
		if _, e = commandOutput(j.ctx, "exiftool", args, ""); e != nil {
			return done, e
		}
		done = append(done, a)
		j.progress(1)
	}
	return done, nil
}
func (j *Job) convert(p Payload) (any, error) {
	formats := map[string]bool{}
	for _, x := range strings.Fields("png jpg jpeg webp avif gif bmp tiff svg mp3 flac aac wav ogg m4a opus mp4 mkv webm mov avi") {
		formats[x] = true
	}
	if !formats[p.Format] {
		return nil, fmt.Errorf("format non autorisé")
	}
	dir, e := validPath(p.Destination)
	if e != nil {
		return nil, e
	}
	done := []string{}
	j.mu.Lock()
	j.Total = int64(len(p.Paths))
	j.mu.Unlock()
	for _, path := range p.Paths {
		if e = j.check(); e != nil {
			return done, e
		}
		src, e := validPath(path)
		if e != nil {
			return done, e
		}
		target := filepath.Join(dir, strings.TrimSuffix(filepath.Base(src), filepath.Ext(src))+"."+p.Format)
		if _, err := os.Lstat(target); !os.IsNotExist(err) {
			target = uniquePath(target)
		}
		temp, e := os.CreateTemp(dir, ".nextexplorer-convert-*."+p.Format)
		if e != nil {
			return done, e
		}
		tmp := temp.Name()
		temp.Close()
		name := "ffmpeg"
		args := []string{"-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", src}
		image := strings.Contains("|png|jpg|jpeg|webp|avif|gif|bmp|tiff|svg|", "|"+p.Format+"|") && !strings.Contains("|.mp4|.mkv|.mov|.avi|.webm|", "|"+strings.ToLower(filepath.Ext(src))+"|")
		if image {
			name = "magick"
			args = []string{src}
			if p.Width > 0 {
				args = append(args, "-resize", fmt.Sprintf("%dx>", min(p.Width, 20000)))
			}
			if p.Strip {
				args = append(args, "-strip")
			}
			args = append(args, "-quality", strconv.Itoa(max(1, min(p.Quality, 100))))
		} else {
			if p.Mode == "remux" {
				args = append(args, "-c", "copy")
			} else {
				audio := strings.Contains("|mp3|flac|aac|wav|ogg|m4a|opus|", "|"+p.Format+"|")
				if audio {
					args = append(args, "-vn")
					if p.Bitrate > 0 && p.Format != "flac" && p.Format != "wav" {
						args = append(args, "-b:a", fmt.Sprintf("%dk", max(32, min(p.Bitrate, 512))))
					}
					if p.Normalize {
						args = append(args, "-af", "loudnorm")
					}
				} else {
					if p.Width > 0 {
						args = append(args, "-vf", fmt.Sprintf("scale=%d:-2", min(p.Width, 7680)))
					}
					codecs := map[string]bool{"libx264": true, "libx265": true, "libsvtav1": true, "libvpx-vp9": true, "h264_nvenc": true, "h264_qsv": true, "h264_vaapi": true}
					if p.Codec != "" {
						if !codecs[p.Codec] {
							os.Remove(tmp)
							return done, fmt.Errorf("codec invalide")
						}
						args = append(args, "-c:v", p.Codec)
					}
					if p.TargetMB > 0 {
						out, err := commandOutput(j.ctx, "ffprobe", []string{"-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", src}, "")
						duration, pe := strconv.ParseFloat(strings.TrimSpace(out), 64)
						if err != nil || pe != nil || duration <= 0 {
							os.Remove(tmp)
							return done, fmt.Errorf("durée indisponible pour le débit cible")
						}
						rate := int(float64(p.TargetMB)*8*1024*1024/duration*.94) - 128000
						args = append(args, "-b:v", strconv.Itoa(max(rate, 32000)), "-b:a", "128k")
					}
				}
			}
			if p.Strip {
				args = append(args, "-map_metadata", "-1")
			}
		}
		args = append(args, tmp)
		_, e = commandOutput(j.ctx, name, args, "")
		if e == nil {
			if _, err := os.Lstat(target); !os.IsNotExist(err) {
				e = fmt.Errorf("destination apparue pendant la conversion")
			} else {
				e = publishFile(tmp, target)
			}
		}
		os.Remove(tmp)
		if e != nil {
			return done, e
		}
		done = append(done, target)
		j.progress(1)
	}
	return done, nil
}
func (j *Job) zip(p Payload) (any, error) {
	dest, e := validPath(p.Destination)
	if e != nil {
		return nil, e
	}
	if e = validName(p.Name); e != nil {
		return nil, e
	}
	target := filepath.Join(dest, p.Name)
	if _, e = os.Lstat(target); !os.IsNotExist(e) {
		return nil, fmt.Errorf("archive existante")
	}
	for _, path := range p.Paths {
		a, e := validPath(path)
		if e != nil {
			return nil, e
		}
		if isWithin(target, a) {
			return nil, fmt.Errorf("archive à l'intérieur de sa source")
		}
	}
	f, e := os.CreateTemp(dest, ".nextexplorer-zip-*")
	if e != nil {
		return nil, e
	}
	tmp := f.Name()
	defer os.Remove(tmp)
	defer f.Close()
	w := zip.NewWriter(f)
	names := map[string]bool{}
	for _, path := range p.Paths {
		base := filepath.Base(path)
		if names[base] {
			w.Close()
			return nil, fmt.Errorf("deux sources portent le même nom")
		}
		names[base] = true
		e = filepath.WalkDir(path, func(a string, d os.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if e := j.check(); e != nil {
				return e
			}
			if d.Type()&os.ModeSymlink != 0 {
				return fmt.Errorf("lien symbolique refusé dans l'archive")
			}
			s, e := d.Info()
			if e != nil {
				return e
			}
			header, e := zip.FileInfoHeader(s)
			if e != nil {
				return e
			}
			rel, _ := filepath.Rel(filepath.Dir(path), a)
			header.Name = filepath.ToSlash(rel)
			if d.IsDir() {
				header.Name += "/"
			} else {
				header.Method = zip.Deflate
			}
			out, e := w.CreateHeader(header)
			if e != nil || d.IsDir() {
				return e
			}
			in, e := os.Open(a)
			if e != nil {
				return e
			}
			defer in.Close()
			_, e = io.Copy(out, &checkedReader{j: j, r: in})
			return e
		})
		if e != nil {
			w.Close()
			return nil, e
		}
	}
	if e = w.Close(); e != nil {
		return nil, e
	}
	if e = f.Close(); e != nil {
		return nil, e
	}
	if _, e = os.Lstat(target); !os.IsNotExist(e) {
		return nil, fmt.Errorf("destination apparue")
	}
	return M{"path": target}, publishFile(tmp, target)
}

type checkedReader struct {
	j *Job
	r io.Reader
}

func (c *checkedReader) Read(p []byte) (int, error) {
	if e := c.j.check(); e != nil {
		return 0, e
	}
	n, e := c.r.Read(p)
	c.j.progress(int64(n))
	return n, e
}
func archiveList(path string) (any, error) {
	a, e := validPath(path)
	if e != nil {
		return nil, e
	}
	if strings.EqualFold(filepath.Ext(a), ".zip") {
		r, e := zip.OpenReader(a)
		if e != nil {
			return nil, e
		}
		defer r.Close()
		rows := []M{}
		for _, f := range r.File {
			rows = append(rows, M{"name": f.Name, "size": f.UncompressedSize64})
			if len(rows) >= 3000 {
				break
			}
		}
		return M{"entries": rows, "total": len(r.File), "truncated": len(r.File) > 3000}, nil
	}
	out, e := runTool("7z", []string{"l", "-slt", "--", a}, "")
	return M{"text": out}, e
}
func (j *Job) download(p Payload) (any, error) {
	u, e := url.Parse(p.URL)
	if e != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" {
		return nil, fmt.Errorf("URL HTTP(S) requise")
	}
	dir, e := validPath(p.Destination)
	if e != nil {
		return nil, e
	}
	if p.Mode == "media" {
		args := []string{"--no-playlist", "--restrict-filenames", "--no-overwrites", "-P", dir}
		if ffmpeg, e := toolPath("ffmpeg"); e == nil {
			args = append(args, "--ffmpeg-location", filepath.Dir(ffmpeg))
		}
		return commandOutput(j.ctx, "yt-dlp", append(args, "--", p.URL), "")
	}
	if e = validName(p.Name); e != nil {
		return nil, e
	}
	target := filepath.Join(dir, p.Name)
	if _, e = os.Lstat(target); !os.IsNotExist(e) {
		target = uniquePath(target)
	}
	req, e := http.NewRequestWithContext(j.ctx, "GET", p.URL, nil)
	if e != nil {
		return nil, e
	}
	client := &http.Client{Timeout: 30 * time.Minute}
	resp, e := client.Do(req)
	if e != nil {
		return nil, e
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	j.mu.Lock()
	j.Total = max(0, resp.ContentLength)
	j.mu.Unlock()
	f, e := os.CreateTemp(dir, ".nextexplorer-download-*")
	if e != nil {
		return nil, e
	}
	tmp := f.Name()
	defer os.Remove(tmp)
	defer f.Close()
	_, e = io.Copy(f, &checkedReader{j: j, r: resp.Body})
	if e != nil {
		return nil, e
	}
	if e = f.Close(); e != nil {
		return nil, e
	}
	if _, e = os.Lstat(target); !os.IsNotExist(e) {
		return nil, fmt.Errorf("destination apparue")
	}
	return M{"path": target}, publishFile(tmp, target)
}
func osOpen(p Payload) (any, error) {
	a, e := validPath(p.Path)
	if e != nil {
		return nil, e
	}
	if _, e = os.Stat(a); e != nil {
		return nil, e
	}
	var c *exec.Cmd
	switch p.Mode {
	case "code":
		bin, e := toolPath("code")
		if e != nil {
			return nil, e
		}
		c = exec.Command(bin, "--", a)
		if runtime.GOOS == "windows" && strings.EqualFold(filepath.Ext(bin), ".cmd") {
			candidate := filepath.Join(filepath.Dir(filepath.Dir(bin)), "Code.exe")
			if _, e := os.Stat(candidate); e != nil {
				return nil, e
			}
			c = exec.Command(candidate, "--", a)
		}
	case "terminal":
		s, _ := os.Stat(a)
		if !s.IsDir() {
			a = filepath.Dir(a)
		}
		switch runtime.GOOS {
		case "windows":
			c = exec.Command("powershell.exe", "-NoExit")
		case "darwin":
			c = exec.Command("open", "-a", "Terminal", a)
		default:
			c = exec.Command("x-terminal-emulator")
		}
		c.Dir = a
	case "default":
		switch runtime.GOOS {
		case "windows":
			c = exec.Command("rundll32.exe", "url.dll,FileProtocolHandler", a)
		case "darwin":
			c = exec.Command("open", a)
		default:
			c = exec.Command("xdg-open", a)
		}
	default:
		return nil, fmt.Errorf("application non autorisée")
	}
	if e = c.Start(); e != nil {
		return nil, e
	}
	go c.Wait()
	return true, nil
}
