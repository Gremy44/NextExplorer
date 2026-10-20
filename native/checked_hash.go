package main

import (
	"context"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"time"

	"lukechampine.com/blake3"
)

const checkedHashLimit = 64 * 1024 * 1024

func checkedHash(p Payload) (any, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	return hashSnapshot(ctx, p)
}

func hashSnapshot(ctx context.Context, p Payload) (any, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	entry, err := statEntry(p.Path)
	if err != nil {
		return nil, err
	}
	if p.Algorithm != "blake3" || p.Expected == nil || entry != *p.Expected || entry.Type != "file" || entry.Stamp == "" || entry.Size < 0 || entry.Size > checkedHashLimit {
		return nil, fmt.Errorf("fichier modifié ou non admissible : fichier ordinaire de 64 Mio maximum et métadonnées précises requis")
	}
	before, err := os.Lstat(entry.Path)
	if err != nil || !before.Mode().IsRegular() {
		return nil, fmt.Errorf("fichier ordinaire requis")
	}
	f, err := os.Open(entry.Path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	stop := context.AfterFunc(ctx, func() { f.Close() })
	defer stop()
	opened, err := f.Stat()
	if err != nil || !os.SameFile(before, opened) || !opened.Mode().IsRegular() || opened.Size() != entry.Size || fmt.Sprint(opened.ModTime().UnixNano()) != entry.Stamp {
		return nil, fmt.Errorf("fichier remplacé avant la lecture")
	}
	hasher := blake3.New(32, nil)
	buffer := make([]byte, 32*1024)
	var read int64
	for {
		if err = ctx.Err(); err != nil {
			return nil, err
		}
		n, readErr := f.Read(buffer[:min(int64(len(buffer)), entry.Size+1-read)])
		read += int64(n)
		if read > entry.Size {
			return nil, fmt.Errorf("fichier agrandi pendant la lecture")
		}
		hasher.Write(buffer[:n])
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return nil, readErr
		}
	}
	after, err := os.Lstat(entry.Path)
	if err != nil || !os.SameFile(before, after) || !after.Mode().IsRegular() || after.Size() != entry.Size || fmt.Sprint(after.ModTime().UnixNano()) != entry.Stamp || read != entry.Size {
		return nil, fmt.Errorf("fichier modifié pendant la lecture")
	}
	if err = ctx.Err(); err != nil {
		return nil, err
	}
	return M{"algorithm": "blake3", "hash": hex.EncodeToString(hasher.Sum(nil)), "entry": entry}, nil
}
