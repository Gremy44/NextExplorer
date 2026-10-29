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

type imageOperation struct {
	ctx     context.Context
	cancel  context.CancelFunc
	created time.Time
	started bool
}

func (h *Host) imageOperation(id string) (*imageOperation, error) {
	if len(id) < 1 || len(id) > 80 || strings.Trim(id, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-") != "" {
		return nil, fmt.Errorf("Identifiant d’aperçu invalide")
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.imageRequests == nil {
		h.imageRequests = map[string]*imageOperation{}
	}
	for key, operation := range h.imageRequests {
		if time.Since(operation.created) > 12*time.Second {
			operation.cancel()
			delete(h.imageRequests, key)
		}
	}
	if operation := h.imageRequests[id]; operation != nil {
		return operation, nil
	}
	if len(h.imageRequests) >= 64 {
		return nil, fmt.Errorf("Trop d’aperçus en attente ; réessayez dans quelques secondes")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	operation := &imageOperation{ctx: ctx, cancel: cancel, created: time.Now()}
	h.imageRequests[id] = operation
	return operation, nil
}

func (h *Host) previewImage(p Payload, sample bool) (any, error) {
	if p.Session == "" {
		return imagePreview(p, sample)
	}
	operation, err := h.imageOperation(p.Session)
	if err != nil {
		return nil, err
	}
	h.mu.Lock()
	if operation.started {
		h.mu.Unlock()
		return nil, fmt.Errorf("Aperçu déjà demandé")
	}
	operation.started = true
	h.mu.Unlock()
	defer func() {
		operation.cancel()
		h.mu.Lock()
		delete(h.imageRequests, p.Session)
		h.mu.Unlock()
	}()
	return imagePreviewContext(operation.ctx, p, sample)
}

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
	scratch, err := os.MkdirTemp("", "nxe-preview-")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(scratch)
	c := exec.CommandContext(ctx, p, append([]string{"-limit", "memory", "128MiB", "-limit", "map", "256MiB", "-limit", "disk", "256MiB", "-limit", "thread", "2", "-limit", "time", "8"}, args...)...)
	quiet(c)
	exe, _ := os.Executable()
	c.Env = append(os.Environ(), "MAGICK_CONFIGURE_PATH="+filepath.Join(filepath.Dir(exe), "security"), "MAGICK_TEMPORARY_PATH="+scratch)
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
	return imagePreviewContext(context.Background(), p, sample)
}

func imagePreviewContext(parent context.Context, p Payload, sample bool) (any, error) {
	ctx, cancel := context.WithTimeout(parent, 8*time.Second)
	defer cancel()
	select {
	case imageSlots <- struct{}{}:
		defer func() { <-imageSlots }()
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	entry, err := statEntry(p.Path)
	if err != nil {
		return nil, err
	}
	if entry.Type != "file" || entry.Size <= 0 {
		return nil, fmt.Errorf("Aperçu réservé aux fichiers image ordinaires non vides")
	}
	if !rasterImage(entry.Path) {
		return nil, fmt.Errorf("Format d’image non pris en charge par cet aperçu")
	}
	if entry.Size > imageFileLimit {
		return nil, fmt.Errorf("Aperçu limité aux images de 256 Mio maximum ; ouvrez le fichier dans son application")
	}
	if p.Expected == nil || entry != *p.Expected {
		return nil, fmt.Errorf("Image modifiée : actualisez le dossier puis réessayez")
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
