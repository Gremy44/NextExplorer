package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type workerReply struct {
	Data   json.RawMessage `json:"data"`
	Error  string          `json:"error"`
	Status string          `json:"status"`
}
type workerClient struct {
	pipe       *os.File
	writer     *Host
	mu         sync.Mutex
	pending    map[string]chan workerReply
	closed     bool
	mcpVersion int
}

func workerAction(action string) bool {
	if action == "WORKER_HELLO" || action == "RELOCATIONS" || strings.HasPrefix(action, "REMOTE_") || strings.HasPrefix(action, "MCP_") {
		return true
	}
	switch action {
	case "EDITOR_SAVE", "FILE_VERSIONS", "FILE_VERSION_CREATE", "FILE_VERSION_READ", "FILE_VERSION_RESTORE", "FILE_VERSION_DELETE":
		return true
	case "QUICK_ACTION", "FS_TRANSFER", "JOB_CONTROL", "JOBS", "JOB_RESULT", "OPERATION_JOURNAL", "TRANSFER_UNDO_CHECK", "TRANSFER_UNDO_RESUME", "TRANSFER_UNDO", "CONVERT", "RECIPE", "ZIP", "ZIP_EXTRACT", "ARCHIVE_EXTRACT", "SCAN", "DUPLICATES", "METADATA_WRITE", "DOWNLOAD", "FS_WRITE", "FS_UPLOAD", "FS_MKDIR", "FS_RENAME", "FS_TRASH", "FS_RESTORE", "BATCH_RENAME":
		return true
	}
	return false
}

func (h *Host) connectedWorker() (*workerClient, error) {
	h.workerMu.Lock()
	defer h.workerMu.Unlock()
	if h.worker != nil {
		h.worker.mu.Lock()
		closed := h.worker.closed
		h.worker.mu.Unlock()
		if !closed {
			return h.worker, nil
		}
		h.worker = nil
	}
	client, err := connectWorker(h.send)
	if err != nil {
		return nil, err
	}
	h.worker = client
	return client, nil
}

func connectWorker(event func(any)) (*workerClient, error) {
	pipe, err := dialWorker()
	if err != nil {
		return nil, err
	}
	c := &workerClient{pipe: pipe, writer: newHost(pipe), pending: map[string]chan workerReply{}}
	go func() {
		defer c.close()
		for {
			data, err := readFrame(pipe)
			if err != nil {
				return
			}
			var message struct {
				ID    string `json:"id"`
				Event string `json:"event"`
				workerReply
			}
			if json.Unmarshal(data, &message) != nil {
				return
			}
			if message.Event != "" {
				var value M
				if json.Unmarshal(data, &value) == nil {
					event(value)
				}
				continue
			}
			c.mu.Lock()
			ch := c.pending[message.ID]
			delete(c.pending, message.ID)
			c.mu.Unlock()
			if ch != nil {
				ch <- message.workerReply
			}
		}
	}()
	value, err := c.request(Request{ID: randomID(), Action: "WORKER_HELLO"})
	if err == nil {
		row, ok := value.(map[string]any)
		if version, valid := row["mcpVersion"].(float64); valid {
			c.mcpVersion = int(version)
		}
		exe, _ := os.Executable()
		if !ok || row["protocol"] != float64(1) || row["executable"] != exe {
			err = fmt.Errorf("un ancien worker est actif ; terminez ses tâches et fermez l’extension une minute avant de vous reconnecter")
		}
	}
	if err != nil {
		c.close()
		return nil, err
	}
	return c, nil
}
func (c *workerClient) close() {
	c.pipe.Close()
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return
	}
	c.closed = true
	for id, ch := range c.pending {
		ch <- workerReply{Error: "Worker déconnecté ; vérifiez l’activité avant de relancer une opération."}
		delete(c.pending, id)
	}
}
func (c *workerClient) request(r Request) (any, error) {
	if r.ID == "" {
		r.ID = randomID()
	}
	ch := make(chan workerReply, 1)
	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		return nil, fmt.Errorf("worker déconnecté ; reconnectez le compagnon")
	}
	c.pending[r.ID] = ch
	c.mu.Unlock()
	defer func() { c.mu.Lock(); delete(c.pending, r.ID); c.mu.Unlock() }()
	c.writer.send(M{"id": r.ID, "action": r.Action, "payload": r.Payload})
	select {
	case reply := <-ch:
		if reply.Status != "SUCCESS" {
			return nil, fmt.Errorf("%s", reply.Error)
		}
		var value any
		if err := json.Unmarshal(reply.Data, &value); err != nil {
			return nil, err
		}
		return value, nil
	case <-time.After(110 * time.Second):
		return nil, fmt.Errorf("réponse du worker non reçue ; ne relancez pas l’opération sans consulter l’activité")
	}
}

func workerDirectory() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	dir = filepath.Join(dir, "NextExplorer", "worker")
	return dir, os.MkdirAll(dir, 0700)
}

func runWorker() error {
	dir, err := workerDirectory()
	if err != nil {
		return err
	}
	unlock, err := lockUndoFile(filepath.Join(dir, "worker.lock"))
	if err != nil {
		return err
	}
	defer unlock()
	h := newHost(io.Discard)
	h.mcpBrowser = newMCPBrowserBroker()
	h.journalDir = filepath.Join(filepath.Dir(dir), "journal")
	h.durableDir = filepath.Join(dir, "tasks")
	h.relocations, err = loadRelocations(filepath.Join(dir, "relocations"))
	if err != nil {
		return err
	}
	if err := h.loadDurableJobs(); err != nil {
		return err
	}
	var clientsMu sync.Mutex
	clients := map[*Host]bool{}
	last := time.Now()
	h.broadcast = func(value any) {
		if row, ok := value.(M); ok && (row["event"] == "PATH_RELOCATED" || row["event"] == "PATHS_RELOCATED") {
			if err := h.relocations.append(row); err != nil {
				value = M{"event": "ORGANIZATION_ERROR", "data": "Fichiers modifiés, mais suivi des tags non sauvegardé : " + err.Error()}
			}
		}
		clientsMu.Lock()
		targets := make([]*Host, 0, len(clients))
		for client := range clients {
			targets = append(targets, client)
		}
		clientsMu.Unlock()
		for _, client := range targets {
			client.send(value)
		}
	}
	go func() {
		for range time.Tick(5 * time.Second) {
			clientsMu.Lock()
			idle := len(clients) == 0 && time.Since(last) > time.Minute
			if !idle {
				clientsMu.Unlock()
				continue
			}
			h.mu.Lock()
			active := h.current != nil
			for _, j := range h.jobs {
				j.mu.Lock()
				active = active || j.State == "running" || j.State == "queued" || j.State == "paused"
				j.mu.Unlock()
			}
			h.mu.Unlock()
			if !active {
				h.mutateMu.Lock()
				for _, upload := range h.uploads {
					upload.file.Close()
					os.Remove(upload.file.Name())
				}
				os.Exit(0)
			}
			clientsMu.Unlock()
		}
	}()
	return acceptWorker(func(pipe *os.File) {
		client := newHost(pipe)
		clientsMu.Lock()
		if len(clients) >= 8 {
			clientsMu.Unlock()
			pipe.Close()
			return
		}
		clients[client] = true
		clientsMu.Unlock()
		go func() {
			peer := &mcpPeer{host: h, client: client}
			defer peer.close()
			defer func() { pipe.Close(); clientsMu.Lock(); delete(clients, client); last = time.Now(); clientsMu.Unlock() }()
			sem := make(chan struct{}, 16)
			var wg sync.WaitGroup
			defer wg.Wait()
			for {
				data, err := readFrame(pipe)
				if err != nil {
					return
				}
				var r Request
				if json.Unmarshal(data, &r) != nil || r.ID == "" {
					return
				}
				sem <- struct{}{}
				wg.Add(1)
				go func() {
					defer func() { <-sem; wg.Done() }()
					var value any
					var err error
					if strings.HasPrefix(r.Action, "MCP_") {
						value, err = peer.dispatch(r)
					} else {
						value, err = h.dispatch(r)
					}
					if err != nil {
						client.send(M{"id": r.ID, "status": "ERROR", "error": err.Error()})
					} else {
						client.send(M{"id": r.ID, "status": "SUCCESS", "data": value})
					}
				}()
			}
		}()
	})
}
