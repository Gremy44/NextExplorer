package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
)

type relocation struct {
	From string `json:"from"`
	To   string `json:"to"`
}
type relocationEvent struct {
	Cursor  int64        `json:"cursor"`
	Changes []relocation `json:"changes"`
}
type relocationLog struct {
	mu       sync.Mutex
	dir      string
	events   []relocationEvent
	sizes    []int
	bytes    int
	sequence int64
	failure  error
}

func loadRelocations(dir string) (*relocationLog, error) {
	log := &relocationLog{dir: dir}
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, err
	}
	files, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	if len(files) > 1000 {
		return nil, fmt.Errorf("historique des déplacements trop volumineux")
	}
	sort.Slice(files, func(i, j int) bool { return files[i].Name() < files[j].Name() })
	for _, file := range files {
		if filepath.Ext(file.Name()) != ".json" {
			continue
		}
		info, err := file.Info()
		if err != nil || !info.Mode().IsRegular() || info.Size() > 700*1024 || log.bytes+int(info.Size()) > 9*1024*1024 {
			return nil, fmt.Errorf("historique des déplacements illisible")
		}
		data, err := os.ReadFile(filepath.Join(dir, file.Name()))
		if err != nil {
			return nil, err
		}
		var event relocationEvent
		if json.Unmarshal(data, &event) != nil || event.Cursor <= log.sequence || event.Cursor > 9007199254740000 || fmt.Sprintf("%016d.json", event.Cursor) != file.Name() || len(event.Changes) == 0 || len(event.Changes) > 1000 {
			return nil, fmt.Errorf("événement de déplacement invalide")
		}
		log.events = append(log.events, event)
		log.sizes = append(log.sizes, len(data))
		log.bytes += len(data)
		log.sequence = event.Cursor
	}
	return log, nil
}
func (log *relocationLog) append(value M) error {
	log.mu.Lock()
	defer log.mu.Unlock()
	var raw any = value["data"]
	if value["event"] == "PATH_RELOCATED" {
		raw = []any{raw}
	}
	data, err := json.Marshal(raw)
	if err != nil {
		return err
	}
	var changes []relocation
	if json.Unmarshal(data, &changes) != nil || len(changes) == 0 || len(changes) > 1000 {
		return fmt.Errorf("déplacements non enregistrables")
	}
	event := relocationEvent{Cursor: log.sequence + 1, Changes: changes}
	if err = atomicJSON(filepath.Join(log.dir, fmt.Sprintf("%016d.json", event.Cursor)), event, 700*1024); err != nil {
		log.failure = err
		return err
	}
	data, _ = json.Marshal(event)
	log.events = append(log.events, event)
	log.sizes = append(log.sizes, len(data))
	log.sequence = event.Cursor
	log.bytes += len(data)
	for len(log.events) > 200 || log.bytes > 8*1024*1024 {
		old := log.events[0]
		if err = os.Remove(filepath.Join(log.dir, fmt.Sprintf("%016d.json", old.Cursor))); err != nil {
			log.failure = err
			return err
		}
		log.bytes -= log.sizes[0]
		log.events = log.events[1:]
		log.sizes = log.sizes[1:]
	}
	value["cursor"] = event.Cursor
	return nil
}
func (log *relocationLog) read(cursor *int64) (any, error) {
	log.mu.Lock()
	defer log.mu.Unlock()
	if log.failure != nil {
		return nil, fmt.Errorf("historique des déplacements incomplet : %w", log.failure)
	}
	rows := []relocationEvent{}
	if cursor == nil {
		return M{"events": rows, "cursor": log.sequence, "more": false, "lost": false}, nil
	}
	if *cursor < 0 || *cursor > log.sequence || (len(log.events) > 0 && *cursor < log.events[0].Cursor-1) {
		return M{"events": rows, "cursor": log.sequence, "more": false, "lost": true}, nil
	}
	last := *cursor
	bytes := 0
	for i, event := range log.events {
		if event.Cursor <= last {
			continue
		}
		if len(rows) >= 50 || bytes+log.sizes[i] > 750*1024 {
			break
		}
		rows = append(rows, event)
		bytes += log.sizes[i]
		last = event.Cursor
	}
	return M{"events": rows, "cursor": last, "more": last < log.sequence, "lost": false}, nil
}
