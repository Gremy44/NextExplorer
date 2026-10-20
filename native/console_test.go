package main

import (
	"bytes"
	"encoding/base64"
	"strings"
	"testing"
)

func TestTerminalPromptChunksAndInput(t *testing.T) {
	s := &terminalSession{marker: "\x1b]777;NextExplorer=secret;", input: make(chan terminalInput, 16)}
	path := `C:\Dossier d’été`
	data := "Bonjour é\r\n" + s.marker + base64.StdEncoding.EncodeToString([]byte(path)) + "\aPS> "
	for _, b := range []byte(data) {
		s.receive([]byte{b})
	}
	if string(s.output) != "Bonjour é\r\nPS> " || s.path != path || !s.atPrompt {
		t.Fatal(string(s.output), s.path, s.atPrompt)
	}
	s.dirty = true
	s.pending = `C:\Autre ' dossier`
	s.syncDirectory()
	if len(s.input) != 0 {
		t.Fatal("navigation overwrote a command being edited")
	}
	s.dirty = false
	s.atPrompt = false
	s.syncDirectory()
	if len(s.input) != 0 {
		t.Fatal("navigation interrupted a running command")
	}
	s.atPrompt = true
	s.syncDirectory()
	command := <-s.input
	if !strings.Contains(command.data, "'C:\\Autre '' dossier'") || s.atPrompt || s.pending != "" {
		t.Fatal(command, s)
	}
	// A failed cd reports once, rather than retrying endlessly at each prompt.
	s.receive([]byte(s.marker + base64.StdEncoding.EncodeToString([]byte(path)) + "\a"))
	if s.error == "" || len(s.input) != 0 {
		t.Fatal("failed navigation was replayed")
	}
}

func TestTerminalOutputAndInputBounds(t *testing.T) {
	s := &terminalSession{marker: "marker", input: make(chan terminalInput, 16)}
	s.receive(bytes.Repeat([]byte("x"), terminalOutputLimit+100))
	if len(s.output) != terminalOutputLimit || !s.dropped {
		t.Fatal("unbounded terminal output")
	}
	for i := 0; i < 16; i++ {
		if err := s.enqueue(terminalInput{data: "x"}); err != nil {
			t.Fatal(err)
		}
	}
	if s.enqueue(terminalInput{data: "overflow"}) == nil {
		t.Fatal("unbounded input queue")
	}
	s.closed = true
	if s.enqueue(terminalInput{data: "x"}) == nil {
		t.Fatal("closed terminal accepted input")
	}
}

func TestTerminalProtocolReplies(t *testing.T) {
	for _, data := range []string{"\x1b[I", "\x1b[O", "\x1b[12;30R", "\x1b[?1;2c", "\x1b[0n"} {
		if !terminalReply.MatchString(data) {
			t.Fatalf("protocol reply treated as input: %q", data)
		}
	}
	for _, data := range []string{"dir\r", "\x1b[A", "\x1b[D", "x\x1b[I", "\x1b[200~pasted"} {
		if terminalReply.MatchString(data) {
			t.Fatalf("user input treated as protocol reply: %q", data)
		}
	}
}
