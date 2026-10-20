package main

import (
	"context"
	"encoding/binary"
	"fmt"
	"os/exec"
	"time"
)

func mediaWaveform(p Payload) (any, error) {
	entry, err := statEntry(p.Path)
	if err != nil {
		return nil, err
	}
	if p.Expected == nil || entry != *p.Expected || entry.Type != "file" || mediaMIME(entry.Ext) == "" {
		return nil, fmt.Errorf("média modifié ou incompatible")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	select {
	case imageSlots <- struct{}{}:
		defer func() { <-imageSlots }()
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	tool, err := toolPath("ffmpeg")
	if err != nil {
		return nil, err
	}
	c := exec.CommandContext(ctx, tool, "-nostdin", "-hide_banner", "-loglevel", "error", "-threads", "1", "-i", entry.Path, "-t", "30", "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", "pipe:1")
	quiet(c)
	var out strictBuffer
	out.limit = 480000
	var stderr limitedBuffer
	c.Stdout = &out
	c.Stderr = &stderr
	if err = runImageCommand(c); err != nil {
		return nil, fmt.Errorf("extrait audio indisponible : %w", err)
	}
	actual, err := statEntry(entry.Path)
	if err != nil || actual != entry {
		return nil, fmt.Errorf("média modifié pendant l’extrait")
	}
	data := []byte(out.String())
	samples := len(data) / 2
	peaks := make([]int, 200)
	for i := 0; i < samples; i++ {
		value := int(int16(binary.LittleEndian.Uint16(data[i*2:])))
		if value < 0 {
			value = -value
		}
		bucket := i * len(peaks) / max(1, samples)
		peaks[bucket] = max(peaks[bucket], value)
	}
	return M{"peaks": peaks, "seconds": min(30, float64(samples)/8000)}, nil
}
