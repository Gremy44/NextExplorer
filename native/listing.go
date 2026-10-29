package main

import (
	"encoding/json"
	"fmt"
	"time"
)

type ListingSnapshot struct {
	data    M
	created time.Time
}

func (h *Host) list(p Payload) (any, error) {
	return h.paginatedListing(p, func() (M, error) {
		all := p
		all.Limit = -1
		all.Offset = 0
		value, err := listDir(all)
		if err != nil {
			return nil, err
		}
		return value.(M), nil
	})
}
func (h *Host) paginatedListing(p Payload, load func() (M, error)) (any, error) {
	requested := p.Path
	if !isRemotePath(requested) {
		var err error
		requested, err = validPath(requested)
		if err != nil {
			return nil, err
		}
	}
	var data M
	key := p.Snapshot
	if key != "" {
		h.mu.Lock()
		snapshot, ok := h.listings[key]
		h.mu.Unlock()
		if !ok || time.Since(snapshot.created) > 5*time.Minute || snapshot.data["currentPath"] != requested {
			return nil, fmt.Errorf("liste expirée : actualisez le dossier")
		}
		data = snapshot.data
	} else {
		if load == nil {
			return nil, fmt.Errorf("liste expirée : actualisez le dossier")
		}
		v, e := load()
		if e != nil {
			return nil, e
		}
		data = v
		key = randomID()
		h.mu.Lock()
		for id, s := range h.listings {
			if time.Since(s.created) > 5*time.Minute {
				delete(h.listings, id)
			}
		}
		if len(h.listings) >= 16 {
			var oldest string
			var timestamp time.Time
			for id, s := range h.listings {
				if oldest == "" || s.created.Before(timestamp) {
					oldest = id
					timestamp = s.created
				}
			}
			delete(h.listings, oldest)
		}
		h.listings[key] = ListingSnapshot{data, time.Now()}
		h.mu.Unlock()
	}
	entries := data["entries"].([]Entry)
	offset := max(0, min(p.Offset, len(entries)))
	limit := p.Limit
	if limit <= 0 || limit > 500 {
		limit = 500
	}
	end := min(offset+limit, len(entries))
	for end > offset+1 {
		b, _ := json.Marshal(entries[offset:end])
		if len(b) < 700*1024 {
			break
		}
		end = offset + (end-offset)/2
	}
	return M{"currentPath": data["currentPath"], "parentPath": data["parentPath"], "entries": entries[offset:end], "total": len(entries), "nextOffset": end, "snapshot": key, "truncated": data["truncated"], "skipped": data["skipped"]}, nil
}
