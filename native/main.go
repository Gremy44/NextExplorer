package main

import (
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/fsnotify/fsnotify"
)

const maxFrame = 1024 * 1024
const protocolVersion = 1

func randomID() string { return rand.Text() }

type M = map[string]any
type Request struct {
	ID      string          `json:"id"`
	Action  string          `json:"action"`
	Payload json.RawMessage `json:"payload"`
}
type Host struct {
	dragStop   chan struct{}
	out        io.Writer
	writeMu    sync.Mutex
	mutateMu   sync.Mutex
	mu         sync.Mutex
	jobs       map[string]*Job
	watcher    *fsnotify.Watcher
	watched    map[string]bool
	uploads    map[string]*Upload
	listings   map[string]ListingSnapshot
	journalDir string
}

func newHost(out io.Writer) *Host {
	return &Host{dragStop: make(chan struct{}), out: out, jobs: map[string]*Job{}, watched: map[string]bool{}, uploads: map[string]*Upload{}, listings: map[string]ListingSnapshot{}}
}
func (h *Host) send(v any) {
	b, e := json.Marshal(v)
	if e != nil {
		return
	}
	if len(b) > maxFrame {
		id := any(nil)
		if message, ok := v.(M); ok {
			id = message["id"]
		}
		b, _ = json.Marshal(M{"id": id, "status": "ERROR", "error": "Réponse trop volumineuse : réduisez la sélection"})
	}
	h.writeMu.Lock()
	defer h.writeMu.Unlock()
	binary.Write(h.out, binary.LittleEndian, uint32(len(b)))
	h.out.Write(b)
}
func readFrame(r io.Reader) ([]byte, error) {
	var n uint32
	if e := binary.Read(r, binary.LittleEndian, &n); e != nil {
		return nil, e
	}
	if n == 0 || n > maxFrame {
		return nil, fmt.Errorf("taille de message invalide")
	}
	b := make([]byte, n)
	_, e := io.ReadFull(r, b)
	return b, e
}
func (h *Host) serve(r io.Reader) {
	sem := make(chan struct{}, 16)
	var wg sync.WaitGroup
	for {
		b, e := readFrame(r)
		if e != nil {
			break
		}
		var req Request
		if json.Unmarshal(b, &req) != nil || req.ID == "" {
			continue
		}
		sem <- struct{}{}
		wg.Add(1)
		go func() {
			defer func() { <-sem; wg.Done() }()
			data, e := h.dispatch(req)
			if e != nil {
				h.send(M{"id": req.ID, "status": "ERROR", "error": e.Error()})
			} else {
				h.send(M{"id": req.ID, "status": "SUCCESS", "data": data})
			}
		}()
	}
	close(h.dragStop)
	wg.Wait()
	h.mu.Lock()
	for _, j := range h.jobs {
		j.control("cancel")
	}
	h.mu.Unlock()
	for _, upload := range h.uploads {
		upload.file.Close()
		os.Remove(upload.file.Name())
	}
}
func originAllowed(origin string, config []byte) bool {
	var c struct {
		Allowed []string `json:"allowed_origins"`
	}
	if json.Unmarshal(config, &c) != nil {
		return false
	}
	for _, a := range c.Allowed {
		if strings.TrimSuffix(a, "/") == strings.TrimSuffix(origin, "/") && strings.HasPrefix(a, "chrome-extension://") && len(strings.TrimSuffix(a, "/")) == 51 {
			return true
		}
	}
	return false
}
func main() {
	exe, e := os.Executable()
	if e != nil {
		return
	}
	config, e := os.ReadFile(filepath.Join(filepath.Dir(exe), "com.local.file_explorer.json"))
	if e != nil || len(os.Args) < 2 || !originAllowed(os.Args[1], config) {
		fmt.Fprintln(os.Stderr, "Origine de l'extension non autorisée")
		os.Exit(1)
	}
	h := newHost(os.Stdout)
	if config, err := os.UserConfigDir(); err == nil {
		h.journalDir = filepath.Join(config, "NextExplorer", "journal")
	}
	w, e := fsnotify.NewWatcher()
	if e == nil {
		h.watcher = w
		defer w.Close()
		go func() {
			for {
				select {
				case ev, ok := <-w.Events:
					if !ok {
						return
					}
					h.send(M{"event": "FS_CHANGED", "data": M{"path": filepath.Dir(ev.Name)}})
				case _, ok := <-w.Errors:
					if !ok {
						return
					}
				}
			}
		}()
	}
	h.serve(os.Stdin)
}

type Payload struct {
	ProtocolVersion *int              `json:"protocolVersion"`
	Snapshot        string            `json:"snapshot"`
	Path            string            `json:"path"`
	Paths           []string          `json:"paths"`
	Destination     string            `json:"destination"`
	Name            string            `json:"name"`
	Text            string            `json:"text"`
	Data            string            `json:"data"`
	ShowHidden      bool              `json:"showHidden"`
	SortBy          string            `json:"sortBy"`
	SortOrder       string            `json:"sortOrder"`
	Offset          int               `json:"offset"`
	Limit           int               `json:"limit"`
	Filter          string            `json:"filter"`
	Mode            string            `json:"mode"`
	Conflict        string            `json:"conflict"`
	Merge           bool              `json:"merge"`
	JobID           string            `json:"jobId"`
	Command         string            `json:"command"`
	Algorithm       string            `json:"algorithm"`
	Pattern         string            `json:"pattern"`
	Replacement     string            `json:"replacement"`
	Prefix          string            `json:"prefix"`
	Suffix          string            `json:"suffix"`
	Case            string            `json:"case"`
	Start           int               `json:"start"`
	Step            int               `json:"step"`
	Digits          int               `json:"digits"`
	Number          bool              `json:"number"`
	Apply           bool              `json:"apply"`
	Format          string            `json:"format"`
	Width           int               `json:"width"`
	Quality         int               `json:"quality"`
	Bitrate         int               `json:"bitrate"`
	Codec           string            `json:"codec"`
	Normalize       bool              `json:"normalize"`
	Strip           bool              `json:"strip"`
	TargetMB        int               `json:"targetMB"`
	Tags            map[string]string `json:"tags"`
	URL             string            `json:"url"`
	Final           bool              `json:"final"`
}

func (h *Host) dispatch(r Request) (any, error) {
	var p Payload
	if len(r.Payload) > 0 {
		if e := json.Unmarshal(r.Payload, &p); e != nil {
			return nil, e
		}
	}
	switch r.Action {
	case "OS_DRAG_FILES":
		return nativeDrag(p.Paths, h.dragStop)
	case "HELLO":
		if p.ProtocolVersion != nil && *p.ProtocolVersion != protocolVersion {
			return nil, fmt.Errorf("Versions incompatibles (extension : protocole %d, compagnon : %d). Mettez à jour l’extension et le compagnon depuis le même paquet, puis désactivez et réactivez l’extension.", *p.ProtocolVersion, protocolVersion)
		}
		return hello(), nil
	case "FS_LIST_DIR":
		return h.list(p)
	case "FS_WATCH":
		return h.watch(p.Paths)
	case "FS_STAT":
		return statEntry(p.Path)
	case "FS_READ":
		return readChunk(p)
	case "FS_WRITE":
		h.mutateMu.Lock()
		defer h.mutateMu.Unlock()
		return writeFile(p)
	case "FS_UPLOAD":
		h.mutateMu.Lock()
		defer h.mutateMu.Unlock()
		return h.upload(p)
	case "FS_MKDIR":
		h.mutateMu.Lock()
		defer h.mutateMu.Unlock()
		dir, e := validPath(p.Path)
		if e != nil {
			return nil, e
		}
		if e = validName(p.Name); e != nil {
			return nil, e
		}
		e = os.Mkdir(filepath.Join(dir, p.Name), 0755)
		return true, e
	case "FS_RENAME":
		h.mutateMu.Lock()
		defer h.mutateMu.Unlock()
		return renameOne(p)
	case "FS_TRASH":
		h.mutateMu.Lock()
		defer h.mutateMu.Unlock()
		return trashFiles(p.Paths)
	case "FS_RESTORE":
		h.mutateMu.Lock()
		defer h.mutateMu.Unlock()
		return restoreTrash(p.Path)
	case "FS_TRANSFER":
		return h.startJob("transfer", p), nil
	case "JOB_CONTROL":
		h.mu.Lock()
		j := h.jobs[p.JobID]
		h.mu.Unlock()
		if j == nil {
			return nil, fmt.Errorf("tâche introuvable")
		}
		j.control(p.Command)
		return true, nil
	case "JOBS":
		h.mu.Lock()
		defer h.mu.Unlock()
		items := []M{}
		for _, j := range h.jobs {
			snapshot := j.snapshot()
			delete(snapshot, "result")
			items = append(items, snapshot)
		}
		return items, nil
	case "OPERATION_JOURNAL":
		return h.readJournal()
	case "TRANSFER_UNDO_CHECK":
		h.mutateMu.Lock()
		defer h.mutateMu.Unlock()
		return h.inspectUndo(p.JobID), nil
	case "TRANSFER_UNDO_RESUME":
		h.mutateMu.Lock()
		defer h.mutateMu.Unlock()
		return h.resumeUndo(p.JobID)
	case "TRANSFER_UNDO":
		h.mutateMu.Lock()
		defer h.mutateMu.Unlock()
		return h.undoCopy(p.JobID)
	case "JOB_RESULT":
		h.mu.Lock()
		j := h.jobs[p.JobID]
		h.mu.Unlock()
		if j == nil {
			return nil, fmt.Errorf("tâche introuvable")
		}
		return j.snapshot()["result"], nil
	case "BATCH_RENAME":
		h.mutateMu.Lock()
		defer h.mutateMu.Unlock()
		return batchRename(p)
	case "HASH":
		return hashFile(p.Path, p.Algorithm)
	case "SCAN":
		return h.startJob("scan", p), nil
	case "DUPLICATES":
		return h.startJob("duplicates", p), nil
	case "CONVERT":
		return h.startJob("convert", p), nil
	case "ZIP":
		return h.startJob("zip", p), nil
	case "ARCHIVE_LIST":
		return archiveList(p.Path)
	case "ZIP_EXTRACT", "ARCHIVE_EXTRACT":
		return h.startJob("extract", p), nil
	case "METADATA":
		return metadata(p.Path)
	case "METADATA_WRITE":
		return h.startJob("metadata", p), nil
	case "DOWNLOAD":
		return h.startJob("download", p), nil
	case "OS_OPEN":
		return osOpen(p)
	case "GIT_STATUS":
		return runTool("git", []string{"-C", p.Path, "status", "--short", "--branch"}, "")
	default:
		return nil, fmt.Errorf("action inconnue : %s", r.Action)
	}
}
func (h *Host) watch(paths []string) (any, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.watcher == nil {
		return nil, fmt.Errorf("surveillance indisponible")
	}
	if len(paths) > 8 {
		return nil, fmt.Errorf("8 dossiers surveillés maximum")
	}
	next := map[string]bool{}
	for _, p := range paths {
		a, e := validPath(p)
		if e != nil {
			return nil, e
		}
		next[a] = true
		if !h.watched[a] {
			if e = h.watcher.Add(a); e != nil {
				return nil, e
			}
		}
	}
	for p := range h.watched {
		if !next[p] {
			h.watcher.Remove(p)
		}
	}
	h.watched = next
	return true, nil
}
