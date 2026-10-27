package main

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"io"
	"regexp"
	"strings"
	"sync"
)

const terminalOutputLimit = 512 * 1024

var terminalReply = regexp.MustCompile(`^\x1b\[(?:\d+;\d+R|[?>]?[\d;]*c|0n|[IO])$`)

type terminalProcess interface {
	io.ReadWriteCloser
	Resize(int, int) error
}
type terminalInput struct {
	data       string
	cols, rows int
}
type terminalSession struct {
	mu                                        sync.Mutex
	id, owner, path, pending, syncing, marker string
	remoteID                                  string
	process                                   terminalProcess
	input                                     chan terminalInput
	stop                                      chan struct{}
	once                                      sync.Once
	output, parsing                           []byte
	dropped, closed, atPrompt, dirty          bool
	queued                                    int
	error                                     string
}

func (h *Host) terminal(p Payload, action string) (any, error) {
	if !consoleSupported() {
		return nil, fmt.Errorf("console intégrée disponible sous Windows uniquement")
	}
	if len(p.Owner) < 16 || len(p.Owner) > 128 {
		return nil, fmt.Errorf("propriétaire du terminal invalide")
	}
	if action == "TERMINAL_CLOSE_OWNER" {
		h.closeTerminals(p.Owner)
		return true, nil
	}
	if action == "TERMINAL_OPEN" {
		directory, err := consoleDirectory(p.Path)
		if err != nil {
			return nil, err
		}
		if p.Columns < 10 || p.Columns > 300 || p.Rows < 2 || p.Rows > 120 {
			return nil, fmt.Errorf("dimensions du terminal invalides")
		}
		h.mu.Lock()
		defer h.mu.Unlock()
		if len(h.terminals) >= 8 {
			return nil, fmt.Errorf("8 consoles déjà ouvertes ; fermez une session")
		}
		s := &terminalSession{id: randomID(), owner: p.Owner, path: directory, marker: "\x1b]777;NextExplorer=" + randomID() + ";", input: make(chan terminalInput, 16), stop: make(chan struct{})}
		marker := strings.TrimSuffix(strings.TrimPrefix(s.marker, "\x1b]777;NextExplorer="), ";")
		s.process, err = startConsole(directory, marker, p.Columns, p.Rows)
		if err != nil {
			return nil, fmt.Errorf("ouverture de PowerShell impossible : %w", err)
		}
		if h.terminals == nil {
			h.terminals = map[string]*terminalSession{}
		}
		h.terminals[s.id] = s
		go s.readLoop()
		go s.writeLoop()
		return M{"id": s.id, "build": consoleBuild()}, nil
	}
	h.mu.Lock()
	s := h.terminals[p.Session]
	h.mu.Unlock()
	if s == nil || s.owner != p.Owner {
		return nil, fmt.Errorf("session du terminal introuvable")
	}
	if action == "TERMINAL_CLOSE" {
		h.mu.Lock()
		delete(h.terminals, s.id)
		h.mu.Unlock()
		s.close()
		return true, nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	switch action {
	case "TERMINAL_READ":
		length := min(len(s.output), 64*1024)
		pending := s.pending
		if pending == "" {
			pending = s.syncing
		}
		result := M{"data": base64.StdEncoding.EncodeToString(s.output[:length]), "path": s.path, "pending": pending, "ready": s.atPrompt && !s.dirty && s.queued == 0, "closed": s.closed, "dropped": s.dropped, "error": s.error}
		s.output = s.output[length:]
		s.dropped = false
		result["more"] = len(s.output) > 0
		return result, nil
	case "TERMINAL_WRITE":
		if len(p.Data) == 0 || len(p.Data) > 16384 {
			return nil, fmt.Errorf("entrée du terminal limitée à 16 Kio")
		}
		if err := s.enqueue(terminalInput{data: p.Data}); err != nil {
			return nil, err
		}
		// Focus notifications and device replies do not edit the command line.
		if !terminalReply.MatchString(p.Data) {
			s.atPrompt = false
			for _, c := range p.Data {
				if c == '\r' || c == '\n' || c == 3 {
					s.dirty = false
				} else {
					s.dirty = true
				}
			}
			// shortcut: editing stays busy until Enter/Ctrl+C, even after erasing the entire line.
		}
		return true, nil
	case "TERMINAL_RESIZE":
		if p.Columns < 10 || p.Columns > 300 || p.Rows < 2 || p.Rows > 120 {
			return nil, fmt.Errorf("dimensions du terminal invalides")
		}
		return true, s.enqueue(terminalInput{cols: p.Columns, rows: p.Rows})
	case "TERMINAL_SYNC":
		if p.Path == "" {
			s.pending = ""
			return true, nil
		}
		var directory string
		var err error
		if s.remoteID != "" {
			var id string
			id, _, err = parseRemoteLocation(p.Path)
			if err == nil && id != s.remoteID {
				err = fmt.Errorf("la console SSH appartient à un autre serveur")
			}
			directory = p.Path
		} else {
			directory, err = consoleDirectory(p.Path)
		}
		if err != nil {
			return nil, err
		}
		s.pending = directory
		s.syncDirectory()
		return true, nil
	}
	return nil, fmt.Errorf("action du terminal inconnue")
}

// Called with s.mu held; the bounded writer keeps shell backpressure off RPC threads.
func (s *terminalSession) enqueue(input terminalInput) error {
	if s.closed {
		return fmt.Errorf("session PowerShell terminée")
	}
	select {
	case s.input <- input:
		s.queued++
		return nil
	default:
		return fmt.Errorf("terminal occupé : entrée non envoyée, réessayez")
	}
}
func (s *terminalSession) syncDirectory() {
	if s.pending == "" || s.closed {
		return
	}
	if s.pending == s.path || (s.remoteID == "" && strings.EqualFold(s.pending, s.path)) {
		s.pending = ""
		return
	}
	if !s.atPrompt || s.dirty || s.queued != 0 {
		return
	}
	command := " Set-Location -LiteralPath '" + strings.ReplaceAll(s.pending, "'", "''") + "' # NextExplorer\r"
	if s.remoteID != "" {
		_, directory, err := parseRemoteLocation(s.pending)
		if err != nil {
			s.error = err.Error()
			return
		}
		command = " cd -- " + shellQuote(directory) + "\r"
	}
	if s.enqueue(terminalInput{data: command}) == nil {
		s.atPrompt = false
		s.syncing = s.pending
		s.pending = ""
		s.error = ""
	}
}
func (s *terminalSession) writeLoop() {
	for {
		select {
		case <-s.stop:
			return
		case input := <-s.input:
			var err error
			if input.cols != 0 {
				err = s.process.Resize(input.cols, input.rows)
			} else {
				_, err = io.WriteString(s.process, input.data)
			}
			s.mu.Lock()
			s.queued--
			if err != nil && !s.closed {
				s.error = "Écriture du terminal interrompue"
			}
			s.syncDirectory()
			s.mu.Unlock()
			if err != nil {
				s.close()
				return
			}
		}
	}
}
func (s *terminalSession) appendOutput(data []byte) {
	if len(data) > terminalOutputLimit {
		data = data[len(data)-terminalOutputLimit:]
		s.dropped = true
	}
	if len(s.output)+len(data) > terminalOutputLimit {
		keep := terminalOutputLimit - len(data)
		copy(s.output, s.output[len(s.output)-keep:])
		s.output = s.output[:keep]
		s.dropped = true
	}
	s.output = append(s.output, data...)
}
func (s *terminalSession) receive(data []byte) {
	s.parsing = append(s.parsing, data...)
	for len(s.parsing) > 0 {
		index := bytes.Index(s.parsing, []byte(s.marker))
		if index < 0 {
			keep := min(len(s.parsing), len(s.marker)-1)
			for keep > 0 && !bytes.HasPrefix([]byte(s.marker), s.parsing[len(s.parsing)-keep:]) {
				keep--
			}
			s.appendOutput(s.parsing[:len(s.parsing)-keep])
			s.parsing = append([]byte(nil), s.parsing[len(s.parsing)-keep:]...)
			return
		}
		if index > 0 {
			s.appendOutput(s.parsing[:index])
			s.parsing = s.parsing[index:]
		}
		end := bytes.IndexByte(s.parsing[len(s.marker):], 7)
		if end < 0 {
			if len(s.parsing) > 16384 {
				s.appendOutput(s.parsing)
				s.parsing = nil
			}
			return
		}
		location, err := base64.StdEncoding.DecodeString(string(s.parsing[len(s.marker) : len(s.marker)+end]))
		if err == nil && len(location) <= 8192 {
			if s.remoteID != "" && (!strings.HasPrefix(string(location), "/") || strings.ContainsAny(string(location), "\x00\r\n\\")) {
				s.error = "Le shell a renvoyé un chemin distant invalide."
				s.parsing = s.parsing[len(s.marker)+end+1:]
				continue
			}
			s.path = string(location)
			if s.remoteID != "" {
				s.path = remoteLocation(s.remoteID, string(location))
			}
			if s.syncing != "" && s.syncing != s.path && (s.remoteID != "" || !strings.EqualFold(s.syncing, s.path)) {
				s.error = "Le changement de dossier a échoué ; vérifiez les droits et l’existence du dossier."
			}
			s.syncing = ""
			s.atPrompt = true
			s.syncDirectory()
		}
		s.parsing = s.parsing[len(s.marker)+end+1:]
	}
}
func (s *terminalSession) readLoop() {
	data := make([]byte, 8192)
	for {
		n, err := s.process.Read(data)
		s.mu.Lock()
		if n > 0 {
			s.receive(data[:n])
		}
		if err != nil {
			s.appendOutput(s.parsing)
			s.parsing = nil
		}
		s.mu.Unlock()
		if err != nil {
			s.close()
			return
		}
	}
}
func (s *terminalSession) close() {
	s.once.Do(func() {
		s.mu.Lock()
		s.closed = true
		s.mu.Unlock()
		close(s.stop)
		s.process.Close()
	})
}
func (h *Host) closeTerminals(owner string) {
	h.mu.Lock()
	var sessions []*terminalSession
	for id, s := range h.terminals {
		if owner == "" || s.owner == owner {
			sessions = append(sessions, s)
			delete(h.terminals, id)
		}
	}
	h.mu.Unlock()
	for _, s := range sessions {
		s.close()
	}
}
