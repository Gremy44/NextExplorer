package main

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

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
	dragStop       chan struct{}
	out            io.Writer
	writeMu        sync.Mutex
	mutateMu       sync.Mutex
	mu             sync.Mutex
	jobs           map[string]*Job
	watcher        *fsnotify.Watcher
	watched        map[string]bool
	uploads        map[string]*Upload
	listings       map[string]ListingSnapshot
	journalDir     string
	durableDir     string
	worker         *workerClient
	workerMu       sync.Mutex
	workerRequired bool
	broadcast      func(any)
	queue          []*Job
	draining       bool
	current        *Job
	streams        *mediaStreams
	relocations    *relocationLog
	terminals      map[string]*terminalSession
}

func newHost(out io.Writer) *Host {
	return &Host{dragStop: make(chan struct{}), out: out, jobs: map[string]*Job{}, watched: map[string]bool{}, uploads: map[string]*Upload{}, listings: map[string]ListingSnapshot{}}
}
func (h *Host) send(v any) {
	if h.broadcast != nil {
		h.broadcast(v)
		return
	}
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
	if f, ok := h.out.(*os.File); ok && f != os.Stdout {
		f.SetWriteDeadline(time.Now().Add(2 * time.Second))
	}
	if err := binary.Write(h.out, binary.LittleEndian, uint32(len(b))); err != nil {
		return
	}
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
	h.closeTerminals("")
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
	if len(os.Args) == 2 && os.Args[1] == "--worker" {
		if err := runWorker(); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		return
	}
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
	h.workerRequired = true
	defer func() {
		if h.worker != nil {
			h.worker.close()
		}
	}()
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
	Owner           string            `json:"owner"`
	Session         string            `json:"session"`
	Columns         int               `json:"columns"`
	Rows            int               `json:"rows"`
	ProtocolVersion *int              `json:"protocolVersion"`
	Snapshot        string            `json:"snapshot"`
	Path            string            `json:"path"`
	Paths           []string          `json:"paths"`
	Destination     string            `json:"destination"`
	Name            string            `json:"name"`
	Text            string            `json:"text"`
	Data            string            `json:"data"`
	ShowHidden      bool              `json:"showHidden"`
	MixedSort       bool              `json:"mixedSort"`
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
	Expected        *Entry            `json:"expected,omitempty"`
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
	VideoQuality    string            `json:"videoQuality"`
	Bitrate         int               `json:"bitrate"`
	Codec           string            `json:"codec"`
	Normalize       bool              `json:"normalize"`
	Strip           bool              `json:"strip"`
	TargetMB        int               `json:"targetMB"`
	Tags            map[string]string `json:"tags"`
	URL             string            `json:"url"`
	Final           bool              `json:"final"`
	Archive         bool              `json:"archive"`
	ArchiveFormat   string            `json:"archiveFormat"`
	Store           bool              `json:"store"`
	Password        string            `json:"password,omitempty"`
	Paused          bool              `json:"paused"`
	StartSeconds    float64           `json:"startSeconds"`
	EndSeconds      float64           `json:"endSeconds"`
	Angle           int               `json:"angle"`
	Cursor          *int64            `json:"cursor"`
}

func (h *Host) dispatch(r Request) (any, error) {
	if h.workerRequired && workerAction(r.Action) {
		client, err := h.connectedWorker()
		if err != nil {
			return nil, fmt.Errorf("worker local indisponible : %w", err)
		}
		return client.request(r)
	}
	var p Payload
	if len(r.Payload) > 0 {
		if e := json.Unmarshal(r.Payload, &p); e != nil {
			return nil, e
		}
	}
	switch r.Action {
	case "FS_WRITE", "FS_UPLOAD", "FS_MKDIR", "FS_RENAME", "FS_TRASH", "FS_RESTORE", "TRANSFER_UNDO_CHECK", "TRANSFER_UNDO_RESUME", "TRANSFER_UNDO", "BATCH_RENAME":
		// Direct actions must not wait and mutate after the browser has timed out.
		if !h.mutateMu.TryLock() {
			return nil, fmt.Errorf("Une tâche locale bloque les modifications. Consultez l’activité et terminez ou annulez la tâche avant de réessayer.")
		}
		defer h.mutateMu.Unlock()
	}
	switch r.Action {
	case "WORKER_HELLO":
		exe, err := os.Executable()
		return M{"protocol": 1, "executable": exe, "pid": os.Getpid(), "tasks": h.durableDir}, err
	case "RELOCATIONS":
		if h.relocations == nil {
			return M{"events": []relocationEvent{}, "cursor": 0, "more": false, "lost": false}, nil
		}
		return h.relocations.read(p.Cursor)
	case "OS_DRAG_FILES":
		return nativeDrag(p.Paths, h.dragStop)
	case "HELLO":
		if p.ProtocolVersion != nil && *p.ProtocolVersion != protocolVersion {
			return nil, fmt.Errorf("Versions incompatibles (extension : protocole %d, compagnon : %d). Mettez à jour l’extension et le compagnon depuis le même paquet, puis désactivez et réactivez l’extension.", *p.ProtocolVersion, protocolVersion)
		}
		value := hello()
		value["features"].(M)["contextualConversion"] = true
		value["features"].(M)["diskVolumes"] = true
		value["features"].(M)["quickActions"] = true
		if consoleSupported() { value["features"].(M)["consoleVersion"] = 1 }
		available := h.durableDir != ""
		if h.workerRequired {
			_, err := h.connectedWorker()
			available = err == nil
			if err != nil {
				value["workerError"] = err.Error()
			}
		}
		value["features"].(M)["durableJobs"] = available
		return value, nil
	case "IMAGE_PREVIEW", "IMAGE_SAMPLE":
		return imagePreview(p, r.Action == "IMAGE_SAMPLE")
	case "TERMINAL_OPEN", "TERMINAL_READ", "TERMINAL_WRITE", "TERMINAL_SYNC", "TERMINAL_RESIZE", "TERMINAL_CLOSE", "TERMINAL_CLOSE_OWNER":
		return h.terminal(p, r.Action)
	case "CONVERSION_CAPABILITIES":
		encoders, err := conversionEncoders(context.Background())
		return M{"encoders": encoders}, err
	case "QUICK_MEDIA_INFO":
		return inspectQuickMedia(context.Background(), p.Path)
	case "QUICK_IMAGE_INFO":
		source, err := inspectConversion(context.Background(), p.Path, "image")
		if err != nil {
			return nil, err
		}
		if p.Expected == nil || *p.Expected != source.entry || source.width*source.height > 16000000 {
			return nil, fmt.Errorf("image modifiée ou supérieure à 16 mégapixels : créez une copie réduite avec le convertisseur")
		}
		return M{"width": source.width, "height": source.height}, nil
	case "QUICK_ACTION":
		return h.startJob("quick", p)
	case "MEDIA_OPEN":
		return h.openMedia(p)
	case "MEDIA_CLOSE":
		return h.closeMedia(p.Name)
	case "MEDIA_WAVEFORM":
		return mediaWaveform(p)
	case "FS_LIST_DIR":
		return h.list(p)
	case "DISK_VOLUMES":
		return diskVolumes()
	case "FS_WATCH":
		return h.watch(p.Paths)
	case "FS_STAT":
		return statEntry(p.Path)
	case "FS_READ":
		return readChunk(p)
	case "FS_TEXT":
		return extractPDF(p.Path)
	case "FS_WRITE":
		return writeFile(p)
	case "FS_UPLOAD":
		return h.upload(p)
	case "FS_MKDIR":
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
		result, err := renameOne(p)
		if err == nil {
			h.send(M{"event": "PATH_RELOCATED", "data": M{"from": p.Path, "to": filepath.Join(filepath.Dir(p.Path), p.Name)}})
		}
		return result, err
	case "FS_TRASH":
		return trashFiles(p.Paths)
	case "FS_RESTORE":
		return restoreTrash(p.Path)
	case "FS_TRANSFER":
		return h.startJob("transfer", p)
	case "JOB_CONTROL":
		h.mu.Lock()
		j := h.jobs[p.JobID]
		h.mu.Unlock()
		if j == nil {
			return nil, fmt.Errorf("tâche introuvable")
		}
		if p.Command == "recover" {
			return h.recoverJob(j, p.Password)
		}
		j.control(p.Command)
		return true, nil
	case "JOBS":
		items := []M{}
		for _, j := range h.sortedJobs() {
			snapshot := j.snapshot()
			delete(snapshot, "result")
			items = append(items, snapshot)
		}
		return items, nil
	case "OPERATION_JOURNAL":
		return h.readJournal()
	case "TRANSFER_UNDO_CHECK":
		return h.inspectUndo(p.JobID), nil
	case "TRANSFER_UNDO_RESUME":
		return h.resumeUndo(p.JobID)
	case "TRANSFER_UNDO":
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
		result, err := batchRename(p)
		if err == nil && p.Apply {
			h.send(M{"event": "PATHS_RELOCATED", "data": result.(M)["rows"]})
		}
		return result, err
	case "HASH":
		if p.Expected != nil {
			return checkedHash(p)
		}
		return hashFile(p.Path, p.Algorithm)
	case "SCAN":
		return h.startJob("scan", p)
	case "DUPLICATES":
		return h.startJob("duplicates", p)
	case "CONVERT":
		return h.startJob("convert", p)
	case "RECIPE":
		return h.startJob("recipe", p)
	case "ZIP":
		return h.startJob("zip", p)
	case "ARCHIVE_LIST":
		return archiveList(p.Path)
	case "ZIP_EXTRACT", "ARCHIVE_EXTRACT":
		return h.startJob("extract", p)
	case "METADATA":
		return metadata(p.Path)
	case "METADATA_WRITE":
		return h.startJob("metadata", p)
	case "DOWNLOAD":
		return h.startJob("download", p)
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
