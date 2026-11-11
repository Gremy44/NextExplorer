package main

import (
	"encoding/json"
	"fmt"

	"github.com/fsnotify/fsnotify"
)

func (s *mcpService) watch(args M) (any, error) {
	var p Payload
	if err := json.Unmarshal(mcpJSON(args), &p); err != nil {
		return nil, err
	}
	if len(p.Paths) > 8 {
		return nil, fmt.Errorf("8 dossiers surveillés maximum")
	}
	// Prepare the replacement first: a failed validation preserves the old watch.
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}
	for _, path := range p.Paths {
		if isRemotePath(path) {
			watcher.Close()
			return nil, fmt.Errorf("surveillance locale uniquement")
		}
		canonical, err := canonicalMCPPath(path)
		if err != nil {
			watcher.Close()
			return nil, err
		}
		if entry, err := statEntry(canonical); err != nil || entry.Type != "directory" {
			watcher.Close()
			return nil, fmt.Errorf("dossier ordinaire requis pour la surveillance")
		}
		if err := watcher.Add(canonical); err != nil {
			watcher.Close()
			return nil, err
		}
	}
	s.mu.Lock()
	if s.watcher != nil {
		s.watcher.Close()
	}
	s.watcher = watcher
	s.changes = []M{}
	s.watchOverflow = false
	s.mu.Unlock()
	go func() {
		for {
			select {
			case event, ok := <-watcher.Events:
				if !ok {
					return
				}
				s.mu.Lock()
				if s.watcher == watcher {
					if len(s.changes) < 200 {
						s.changes = append(s.changes, M{"path": event.Name, "operation": event.Op.String()})
					} else {
						s.watchOverflow = true
					}
				}
				s.mu.Unlock()
			case _, ok := <-watcher.Errors:
				if !ok {
					return
				}
				s.mu.Lock()
				s.watchOverflow = true
				s.mu.Unlock()
			}
		}
	}()
	return M{"paths": p.Paths, "recursive": false, "readChanges": "nxe_fs_changes"}, nil
}
