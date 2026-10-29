package main

import (
	"fmt"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

type mediaLease struct {
	entry   Entry
	expires time.Time
}
type mediaStreams struct {
	mu     sync.Mutex
	leases map[string]mediaLease
	base   string
	slots  chan struct{}
}

func mediaMIME(ext string) string {
	return map[string]string{".mp4": "video/mp4", ".m4v": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".mkv": "video/x-matroska", ".avi": "video/x-msvideo", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".aac": "audio/aac", ".wav": "audio/wav", ".ogg": "audio/ogg", ".opus": "audio/ogg", ".flac": "audio/flac"}[strings.ToLower(ext)]
}

func (h *Host) openMedia(p Payload) (any, error) {
	entry, err := statEntry(p.Path)
	if err != nil {
		return nil, err
	}
	if p.Expected == nil || entry != *p.Expected || entry.Type != "file" || mediaMIME(entry.Ext) == "" {
		return nil, fmt.Errorf("média ordinaire compatible et inchangé requis")
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.streams == nil {
		listener, err := net.Listen("tcp4", "127.0.0.1:0")
		if err != nil {
			return nil, err
		}
		s := &mediaStreams{leases: map[string]mediaLease{}, base: "http://" + listener.Addr().String()}
		s.slots = make(chan struct{}, 8)
		h.streams = s
		server := &http.Server{Handler: s, ReadHeaderTimeout: 3 * time.Second, IdleTimeout: 10 * time.Second, MaxHeaderBytes: 8192}
		go server.Serve(listener)
	}
	s := h.streams
	s.mu.Lock()
	defer s.mu.Unlock()
	for token, lease := range s.leases {
		if time.Now().After(lease.expires) {
			delete(s.leases, token)
		}
	}
	if len(s.leases) >= 8 {
		return nil, fmt.Errorf("8 médias déjà ouverts ; fermez un aperçu")
	}
	token := randomID() + randomID()
	s.leases[token] = mediaLease{entry: entry, expires: time.Now().Add(30 * time.Minute)}
	return M{"url": s.base + "/" + token, "token": token, "expiresIn": 1800}, nil
}
func (h *Host) closeMedia(token string) (any, error) {
	h.mu.Lock()
	s := h.streams
	h.mu.Unlock()
	if s != nil {
		s.mu.Lock()
		delete(s.leases, token)
		s.mu.Unlock()
	}
	return true, nil
}
func (s *mediaStreams) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if s.slots != nil {
		select {
		case s.slots <- struct{}{}:
			defer func() { <-s.slots }()
		default:
			http.Error(w, "Trop de lectures", http.StatusServiceUnavailable)
			return
		}
	}
	if strings.Contains(r.Header.Get("Range"), ",") {
		http.Error(w, "Une seule plage par requête", http.StatusRequestedRangeNotSatisfiable)
		return
	}
	if (r.Method != "GET" && r.Method != "HEAD") || r.Host != strings.TrimPrefix(s.base, "http://") {
		http.Error(w, "Refusé", http.StatusForbidden)
		return
	}
	if origin := r.Header.Get("Origin"); origin != "" && !strings.HasPrefix(origin, "chrome-extension://") {
		http.Error(w, "Refusé", http.StatusForbidden)
		return
	}
	token := strings.TrimPrefix(r.URL.Path, "/")
	s.mu.Lock()
	lease, ok := s.leases[token]
	s.mu.Unlock()
	if !ok || time.Now().After(lease.expires) {
		http.NotFound(w, r)
		return
	}
	actual, err := statEntry(lease.entry.Path)
	if err != nil || actual != lease.entry {
		http.Error(w, "Média modifié", http.StatusConflict)
		return
	}
	f, err := os.Open(lease.entry.Path)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() != lease.entry.Size || fmt.Sprint(info.ModTime().UnixNano()) != lease.entry.Stamp {
		http.Error(w, "Média modifié", http.StatusConflict)
		return
	}
	w.Header().Set("Content-Type", mediaMIME(lease.entry.Ext))
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "no-referrer")
	// ServeContent handles byte ranges/seeking without assembling the file in memory.
	http.ServeContent(w, r, "media"+lease.entry.Ext, info.ModTime(), f)
}
