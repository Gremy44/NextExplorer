package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const imageFileLimit = 256 << 20

var imageSlots = make(chan struct{}, 2)

func rasterImage(path string) bool {
	return strings.Contains("|.jpg|.jpeg|.png|.webp|.gif|.bmp|.tif|.tiff|.avif|.heic|.heif|", "|"+strings.ToLower(filepath.Ext(path))+"|")
}

// The decoder runs outside Chrome, with a deadline and explicit pixel/disk limits.
func imageOutput(ctx context.Context, args []string, limit int) ([]byte, error) {
	p, err := toolPath("magick")
	if err != nil {
		return nil, err
	}
	c := exec.CommandContext(ctx, p, append([]string{"-limit", "memory", "128MiB", "-limit", "map", "256MiB", "-limit", "disk", "256MiB", "-limit", "thread", "2", "-limit", "time", "8"}, args...)...)
	quiet(c)
	exe, _ := os.Executable()
	c.Env = append(os.Environ(), "MAGICK_CONFIGURE_PATH="+filepath.Join(filepath.Dir(exe), "security"))
	var out strictBuffer
	out.limit = limit
	var stderr limitedBuffer
	c.Stdout, c.Stderr = &out, &stderr
	if err = runImageCommand(c); err != nil {
		return nil, fmt.Errorf("aperçu indisponible ou limite atteinte : %s (%w)", journalText(stderr.String()), err)
	}
	return []byte(out.String()), nil
}

func imagePreview(p Payload, sample bool) (any, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	select {
	case imageSlots <- struct{}{}:
		defer func() { <-imageSlots }()
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	entry, err := statEntry(p.Path)
	if err != nil {
		return nil, err
	}
	if entry.Type != "file" || !rasterImage(entry.Path) || entry.Size <= 0 || entry.Size > imageFileLimit || p.Expected == nil || entry != *p.Expected {
		return nil, fmt.Errorf("image modifiée ou non admissible (fichier ordinaire de 256 Mio maximum)")
	}
	before, err := os.Lstat(entry.Path)
	if err != nil || !before.Mode().IsRegular() {
		return nil, fmt.Errorf("image ordinaire requise")
	}
	coder := imageCoder(entry.Path)
	source := coder + ":" + entry.Path + "[0]"
	dimensions, err := imageOutput(ctx, []string{"-ping", source, "-format", "%w %h", "info:"}, 128)
	if err != nil {
		return nil, err
	}
	fields := strings.Fields(string(dimensions))
	if len(fields) != 2 {
		return nil, fmt.Errorf("dimensions illisibles")
	}
	w, ew := strconv.ParseInt(fields[0], 10, 64)
	h, eh := strconv.ParseInt(fields[1], 10, 64)
	if ew != nil || eh != nil || w < 1 || h < 1 || w > 100000 || h > 100000 || w*h > 100000000 {
		return nil, fmt.Errorf("image limitée à 100 mégapixels")
	}
	args := []string{source, "-auto-orient", "-background", "white", "-alpha", "remove", "-alpha", "off", "-colorspace", "sRGB"}
	limit := 700 * 1024
	if sample {
		args = append(args, "-resize", "9x8!", "-depth", "8", "rgb:-")
		limit = 216
	} else {
		width := max(64, min(p.Width, 1600))
		args = append(args, "-thumbnail", fmt.Sprintf("%dx%d>", width, width), "-strip", "-quality", "82", "jpeg:-")
	}
	data, err := imageOutput(ctx, args, limit)
	if err != nil {
		return nil, err
	}
	after, err := os.Lstat(entry.Path)
	if err != nil || !os.SameFile(before, after) || after.Size() != entry.Size || fmt.Sprint(after.ModTime().UnixNano()) != entry.Stamp {
		return nil, fmt.Errorf("image modifiée pendant l’aperçu")
	}
	if sample {
		if len(data) != 216 {
			return nil, fmt.Errorf("échantillon incomplet")
		}
		return M{"entry": entry, "width": w, "height": h, "pixels": hex.EncodeToString(data)}, nil
	}
	if !bytes.HasPrefix(data, []byte{0xff, 0xd8}) {
		return nil, fmt.Errorf("aperçu JPEG invalide")
	}
	return M{"entry": entry, "width": w, "height": h, "data": base64.StdEncoding.EncodeToString(data), "mime": "image/jpeg"}, nil
}
