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
	for _, n := range []string{"ffmpeg", "ffprobe", "magick", "exiftool", "7z", "yt-dlp", "git", "code", "pdftotext"} {
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
	if name == "magick" {
		args = append([]string{"-limit", "memory", "128MiB", "-limit", "map", "256MiB", "-limit", "disk", "256MiB", "-limit", "thread", "2", "-limit", "time", "300"}, args...)
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
	if name == "magick" {
		e = runImageCommand(c)
	} else {
		e = c.Run()
	}
	if e != nil {
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
func (j *Job) recipe(p Payload) (any, error) {
	if !p.Archive || len(p.Paths) == 0 || len(p.Paths) > 200 {
		return nil, fmt.Errorf("recette : conversion de 1 à 200 fichiers puis archive requise")
	}
	if err := validName(p.Name); err != nil {
		return nil, err
	}
	if !strings.HasSuffix(strings.ToLower(p.Name), ".zip") {
		return nil, fmt.Errorf("le nom de l’archive de la recette doit se terminer par .zip")
	}
	if _, err := os.Lstat(filepath.Join(p.Destination, p.Name)); !os.IsNotExist(err) {
		return nil, fmt.Errorf("archive de destination déjà présente")
	}
	converted, err := j.convert(p)
	if err != nil {
		return converted, err
	}
	if err = j.check(); err != nil {
		return converted, err
	}
	if err = j.checkpoint(len(p.Paths), true, j.completed); err != nil {
		return converted, err
	}
	archive := p
	archive.Paths = converted.([]string)
	result, err := j.zip(archive)
	return M{"copies": converted, "archive": result}, err
}
func (j *Job) zip(p Payload) (any, error) {
	if p.ArchiveFormat == "7z" || p.Password != "" {
		return j.advancedArchive(p)
	}
	if p.ArchiveFormat != "" && p.ArchiveFormat != "zip" {
		return nil, fmt.Errorf("format d’archive non pris en charge")
	}
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
	count := 0
	var bytes int64
	for _, path := range p.Paths {
		base := filepath.Base(path)
		if names[strings.ToLower(base)] {
			w.Close()
			return nil, fmt.Errorf("deux sources portent le même nom")
		}
		names[strings.ToLower(base)] = true
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
			count++
			if !s.IsDir() {
				bytes += s.Size()
			}
			if !s.IsDir() && !s.Mode().IsRegular() {
				return fmt.Errorf("fichier spécial refusé dans l’archive")
			}
			if count > 3000 || (!d.IsDir() && s.Size() > int64(extractMaxFile)) || bytes > int64(extractMaxBytes) {
				return fmt.Errorf("archive limitée à 3 000 entrées, 256 Mio par fichier et 1 Gio au total")
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
				if p.Store {
					header.Method = zip.Store
				} else {
					header.Method = zip.Deflate
				}
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
			opened, err := in.Stat()
			if err != nil || !os.SameFile(s, opened) || s.Size() != opened.Size() || !s.ModTime().Equal(opened.ModTime()) {
				return fmt.Errorf("source d’archive remplacée avant lecture")
			}
			_, e = io.Copy(out, &checkedReader{j: j, r: in})
			if e == nil {
				after, err := os.Lstat(a)
				if err != nil || !os.SameFile(s, after) || s.Size() != after.Size() || !s.ModTime().Equal(after.ModTime()) {
					return fmt.Errorf("source d’archive modifiée pendant lecture")
				}
			}
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
