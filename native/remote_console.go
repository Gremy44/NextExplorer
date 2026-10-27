package main

import (
	"fmt"
	"golang.org/x/crypto/ssh"
	"io"
	"strings"
	"time"
)

func shellQuote(value string) string { return "'" + strings.ReplaceAll(value, "'", "'\"'\"'") + "'" }

type sshTerminal struct {
	session *ssh.Session
	input   io.WriteCloser
	output  io.Reader
}

func (p *sshTerminal) Read(data []byte) (int, error)  { return p.output.Read(data) }
func (p *sshTerminal) Write(data []byte) (int, error) { return p.input.Write(data) }
func (p *sshTerminal) Close() error                   { return p.session.Close() }
func (p *sshTerminal) Resize(cols, rows int) error    { return p.session.WindowChange(rows, cols) }

func (h *Host) remoteTerminal(p Payload, action string) (any, error) {
	if len(p.Owner) < 16 || len(p.Owner) > 128 {
		return nil, fmt.Errorf("propriétaire du terminal invalide")
	}
	if action == "TERMINAL_CLOSE_OWNER" {
		h.closeTerminals(p.Owner)
		return true, nil
	}
	if action != "TERMINAL_OPEN" {
		h.mu.Lock()
		s := h.terminals[p.Session]
		h.mu.Unlock()
		if s == nil || s.owner != p.Owner || s.remoteID == "" {
			return nil, fmt.Errorf("console SSH introuvable")
		}
		return h.terminal(p, action)
	}
	if p.Columns < 10 || p.Columns > 300 || p.Rows < 2 || p.Rows > 120 {
		return nil, fmt.Errorf("dimensions du terminal invalides")
	}
	id, directory, err := parseRemoteLocation(p.Path)
	if err != nil {
		return nil, err
	}
	hub, err := h.remoteHub()
	if err != nil {
		return nil, err
	}
	c, err := hub.connection(id)
	if err != nil {
		return nil, err
	}
	if c.ssh == nil {
		return nil, fmt.Errorf("console SSH réservée aux connexions SFTP")
	}
	actual, err := h.locationStat(p.Path)
	if err != nil || actual.Type != "directory" {
		return nil, fmt.Errorf("dossier distant indisponible")
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if len(h.terminals) >= 8 {
		return nil, fmt.Errorf("8 consoles déjà ouvertes")
	}
	s := &terminalSession{id: randomID(), owner: p.Owner, path: p.Path, remoteID: id, marker: "\x1b]777;NextExplorer=" + randomID() + ";", input: make(chan terminalInput, 16), stop: make(chan struct{})}
	// A stalled shell request must not hold the native message handler indefinitely.
	timer := time.AfterFunc(15*time.Second, func() { c.Close() })
	defer timer.Stop()
	session, err := c.ssh.NewSession()
	if err != nil {
		return nil, fmt.Errorf("ce serveur n’autorise pas la console SSH : %w", err)
	}
	failed := true
	defer func() {
		if failed {
			session.Close()
		}
	}()
	if err = session.RequestPty("xterm-256color", p.Rows, p.Columns, ssh.TerminalModes{ssh.ECHO: 1}); err != nil {
		return nil, fmt.Errorf("terminal interactif refusé par le serveur")
	}
	input, err := session.StdinPipe()
	if err != nil {
		return nil, err
	}
	output, err := session.StdoutPipe()
	if err != nil {
		return nil, err
	}
	// POSIX sh, not the user’s login shell: one known prompt contract for safe folder following.
	prompt := "$(printf '\\033]777;NextExplorer=" + strings.TrimSuffix(strings.TrimPrefix(s.marker, "\x1b]777;NextExplorer="), ";") + ";%s\\007' \"$(printf %s \"$PWD\" | base64 | tr -d '\\r\\n')\")SSH ${PWD}$ "
	command := "cd -- " + shellQuote(directory) + " && ENV= PS1=" + shellQuote(prompt) + " exec sh -i"
	if err = session.Start(command); err != nil {
		return nil, fmt.Errorf("shell POSIX indisponible sur ce serveur")
	}
	s.process = &sshTerminal{session: session, input: input, output: output}
	if h.terminals == nil {
		h.terminals = map[string]*terminalSession{}
	}
	h.terminals[s.id] = s
	failed = false
	go s.readLoop()
	go s.writeLoop()
	return M{"id": s.id, "ssh": true}, nil
}
