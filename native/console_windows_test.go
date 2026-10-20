package main

import (
	"bytes"
	"encoding/base64"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"golang.org/x/sys/windows"
)

func TestPowerShellConsoleSession(t *testing.T) {
	h := newHost(io.Discard)
	defer h.closeTerminals("")
	root := t.TempDir()
	child := filepath.Join(root, "Dossier [été] ' spécial")
	if err := os.Mkdir(child, 0700); err != nil {
		t.Fatal(err)
	}
	p := Payload{Owner: strings.Repeat("a", 32), Path: root, Columns: 100, Rows: 30}
	opened, err := h.terminal(p, "TERMINAL_OPEN")
	if err != nil {
		t.Fatal(err)
	}
	p.Session = opened.(M)["id"].(string)
	var output strings.Builder
	wait := func(condition func(M) bool) M {
		t.Helper()
		deadline := time.Now().Add(15 * time.Second)
		for time.Now().Before(deadline) {
			value, err := h.terminal(p, "TERMINAL_READ")
			if err != nil {
				t.Fatal(err)
			}
			state := value.(M)
			data, _ := base64.StdEncoding.DecodeString(state["data"].(string))
			output.Write(data)
			if condition(state) {
				return state
			}
			time.Sleep(40 * time.Millisecond)
		}
		t.Fatalf("console timeout: %s", output.String())
		return nil
	}
	wait(func(state M) bool { return state["ready"] == true })
	other := p
	other.Owner = strings.Repeat("b", 32)
	if _, err := h.terminal(other, "TERMINAL_READ"); err == nil {
		t.Fatal("cross-view terminal access")
	}
	p.Data = "Write-Output 'console-ok'\r"
	if _, err := h.terminal(p, "TERMINAL_WRITE"); err != nil {
		t.Fatal(err)
	}
	wait(func(state M) bool { return state["ready"] == true && strings.Contains(output.String(), "console-ok") })
	p.Path = child
	if _, err := h.terminal(p, "TERMINAL_SYNC"); err != nil {
		t.Fatal(err)
	}
	wait(func(state M) bool { return state["ready"] == true && state["path"] == child })
	p.Data = "Write-Output 'partiel"
	h.terminal(p, "TERMINAL_WRITE")
	p.Path = root
	h.terminal(p, "TERMINAL_SYNC")
	time.Sleep(100 * time.Millisecond)
	value, _ := h.terminal(p, "TERMINAL_READ")
	if value.(M)["path"] != child || value.(M)["pending"] != root {
		t.Fatal("partial input lost", value)
	}
	p.Data = "'\r"
	h.terminal(p, "TERMINAL_WRITE")
	wait(func(state M) bool { return state["ready"] == true && state["path"] == root })
	p.Data = "Start-Sleep -Seconds 30\r"
	h.terminal(p, "TERMINAL_WRITE")
	time.Sleep(200 * time.Millisecond)
	p.Path = child
	h.terminal(p, "TERMINAL_SYNC")
	value, _ = h.terminal(p, "TERMINAL_READ")
	if value.(M)["ready"] != false || value.(M)["path"] != root {
		t.Fatal("running command interrupted", value)
	}
	p.Data = "\x03"
	h.terminal(p, "TERMINAL_WRITE")
	wait(func(state M) bool { return state["ready"] == true && state["path"] == child })
	p.Columns = 50
	p.Rows = 12
	if _, err := h.terminal(p, "TERMINAL_RESIZE"); err != nil {
		t.Fatal(err)
	}
	p.Data = "Start-Sleep -Seconds 30\r"
	if _, err := h.terminal(p, "TERMINAL_WRITE"); err != nil {
		t.Fatal(err)
	}
	time.Sleep(100 * time.Millisecond)
	writerDone := make(chan struct{})
	process := h.terminals[p.Session].process
	go func() { process.Write(bytes.Repeat([]byte("x"), 256*1024)); close(writerDone) }()
	time.Sleep(100 * time.Millisecond)
	closed := make(chan error, 1)
	go func() { _, err := h.terminal(p, "TERMINAL_CLOSE"); closed <- err }()
	select {
	case err := <-closed:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("close blocked by pending input")
	}
	select {
	case <-writerDone:
	case <-time.After(time.Second):
		t.Fatal("input writer retained after close")
	}
	if _, err := h.terminal(p, "TERMINAL_READ"); err == nil {
		t.Fatal("closed terminal accessible")
	}
	// PowerShell's initial directory handling treats brackets as wildcards unless set literally.
	p.Path = child
	opened, err = h.terminal(p, "TERMINAL_OPEN")
	if err != nil {
		t.Fatal(err)
	}
	p.Session = opened.(M)["id"].(string)
	wait(func(state M) bool { return state["ready"] == true && state["path"] == child })
	pidFile := filepath.Join(root, "child-pid.txt")
	p.Data = "$nextChild = Start-Process -ErrorAction Stop -WindowStyle Hidden -WorkingDirectory '" + strings.ReplaceAll(root, "'", "''") + "' -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList '-NoProfile','-NonInteractive','-Command','Start-Sleep -Seconds 120' -PassThru; [IO.File]::WriteAllText('" + strings.ReplaceAll(pidFile, "'", "''") + "', [string]$nextChild.Id)\r"
	if _, err := h.terminal(p, "TERMINAL_WRITE"); err != nil {
		t.Fatal(err)
	}
	wait(func(state M) bool {
		data, err := os.ReadFile(pidFile)
		return state["ready"] == true && err == nil && len(data) > 0
	})
	pidText, err := os.ReadFile(pidFile)
	if err != nil {
		t.Fatal(err)
	}
	pid, err := strconv.ParseUint(string(pidText), 10, 32)
	if err != nil {
		t.Fatal(err)
	}
	childProcess, err := windows.OpenProcess(windows.SYNCHRONIZE, false, uint32(pid))
	if err != nil {
		t.Fatal(err)
	}
	defer windows.CloseHandle(childProcess)
	p.Data = "exit\r"
	if _, err := h.terminal(p, "TERMINAL_WRITE"); err != nil {
		t.Fatal(err)
	}
	wait(func(state M) bool { return state["closed"] == true })
	if status, err := windows.WaitForSingleObject(childProcess, 5000); err != nil || status != windows.WAIT_OBJECT_0 {
		t.Fatal("PowerShell child survived session exit", status, err)
	}
	h.closeTerminals(p.Owner)
	if len(h.terminals) != 0 {
		t.Fatal("owner disconnect retained a terminal")
	}
}
