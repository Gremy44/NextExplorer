package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func mcpFixture(t *testing.T, caps ...string) *mcpService {
	t.Helper()
	root := t.TempDir()
	t.Setenv("APPDATA", t.TempDir())
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	h := newHost(io.Discard)
	h.mcpBrowser = newMCPBrowserBroker()
	h.journalDir = filepath.Join(t.TempDir(), "journal")
	s, err := newMCPService(h, mcpConfig{Roots: []string{root}, Capabilities: caps})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(s.close)
	return s
}
func mcpInvoke(t *testing.T, s *mcpService, action string, args M) (any, error) {
	t.Helper()
	spec, ok := mcpSpecByName("nxe_" + strings.ToLower(action))
	if !ok {
		t.Fatal(action)
	}
	if err := validateMCPArgs(spec, args); err != nil {
		return nil, err
	}
	return s.call(context.Background(), spec, args)
}
func TestMCPCatalogSchemas(t *testing.T) {
	names := map[string]bool{}
	for _, spec := range mcpSpecs {
		if names[spec.name()] {
			t.Fatal("duplicate", spec.name())
		}
		names[spec.name()] = true
		schema, err := mcpSchema(spec)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := schema.Resolve(nil); err != nil {
			t.Fatalf("%s: %v", spec.name(), err)
		}
		if err := validateMCPArgs(spec, M{"arbitraryOwner": "no"}); err == nil {
			t.Fatal("extra fields accepted", spec.name())
		}
	}
	if len(names) < 85 {
		t.Fatal("incomplete catalogue", len(names))
	}
}
func TestMCPScopeAndWrites(t *testing.T) {
	s := mcpFixture(t)
	root := s.config.Roots[0]
	outside := t.TempDir()
	file := filepath.Join(root, "test.txt")
	os.WriteFile(file, []byte("bonjour"), 0600)
	if _, err := mcpInvoke(t, s, "FS_READ", M{"path": file}); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{outside, filepath.Join(outside, "new.txt"), filepath.Join(root, "..", filepath.Base(outside))} {
		if _, err := mcpInvoke(t, s, "FS_STAT", M{"path": path}); err == nil {
			t.Fatal("escaped root", path)
		}
	}
	if _, err := mcpInvoke(t, s, "FS_WRITE", M{"path": root, "name": "new.txt", "text": "no"}); err == nil {
		t.Fatal("write without capability")
	}
	if _, err := mcpInvoke(t, s, "BATCH_RENAME", M{"paths": []any{file}, "apply": true}); err == nil {
		t.Fatal("batch apply without capability")
	}
	s.config.Capabilities = []string{"write"}
	if _, err := mcpInvoke(t, s, "FS_WRITE", M{"path": root, "name": "new.txt", "text": "yes"}); err != nil {
		t.Fatal(err)
	}
	if _, err := mcpInvoke(t, s, "FS_RENAME", M{"path": root, "name": "escape"}); err == nil {
		t.Fatal("root rename escaped")
	}
	if _, err := mcpInvoke(t, s, "FS_TRASH", M{"paths": []any{root}}); err == nil {
		t.Fatal("root trash escaped")
	}
	if _, err := mcpInvoke(t, s, "FS_WRITE", M{"path": root, "name": "../escape", "text": "x"}); err == nil {
		t.Fatal("name traversal")
	}
	if err := os.Symlink(outside, filepath.Join(root, "link")); err == nil {
		if _, err := mcpInvoke(t, s, "FS_STAT", M{"path": filepath.Join(root, "link")}); err == nil {
			t.Fatal("symlink escape")
		}
	}
	for _, action := range []string{"TERMINAL_OPEN", "OS_OPEN", "DOWNLOAD", "REMOTE_CONNECT"} {
		spec, _ := mcpSpecByName("nxe_" + strings.ToLower(action))
		if err := s.authorize(spec, M{}); err == nil {
			t.Fatal("capability not checked", action)
		}
	}
}
func TestMCPEditorAndOwnedDurableJobs(t *testing.T) {
	s := mcpFixture(t, "write")
	root := s.config.Roots[0]
	file := filepath.Join(root, "readme.txt")
	os.WriteFile(file, []byte("before"), 0600)
	doc, err := mcpInvoke(t, s, "EDITOR_READ", M{"path": file})
	if err != nil {
		t.Fatal(err)
	}
	raw := M{}
	json.Unmarshal(mcpJSON(doc), &raw)
	if _, err := mcpInvoke(t, s, "EDITOR_SAVE", M{"path": file, "text": "after", "snapshot": raw["hash"], "expected": raw["entry"]}); err != nil {
		t.Fatal(err)
	}
	if _, err := mcpInvoke(t, s, "EDITOR_SAVE", M{"path": file, "text": "stale", "snapshot": raw["hash"], "expected": raw["entry"]}); err == nil {
		t.Fatal("stale snapshot accepted")
	}
	job, err := mcpInvoke(t, s, "SCAN", M{"path": root})
	if err != nil {
		t.Fatal(err)
	}
	id := job.(M)["jobId"].(string)
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		rows, err := mcpInvoke(t, s, "JOBS", M{})
		if err != nil {
			t.Fatal(err)
		}
		if len(rows.([]M)) != 1 {
			t.Fatalf("owned jobs: %v", rows)
		}
		if rows.([]M)[0]["state"] == "completed" {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if _, err := mcpInvoke(t, s, "JOB_RESULT", M{"jobId": id}); err != nil {
		t.Fatal(err)
	}
	if _, err := mcpInvoke(t, s, "JOB_RESULT", M{"jobId": "other"}); err == nil {
		t.Fatal("foreign job")
	}
	again, err := newMCPService(s.h, s.config)
	if err != nil {
		t.Fatal(err)
	}
	defer again.close()
	if _, err := mcpInvoke(t, again, "JOB_RESULT", M{"jobId": id}); err != nil {
		t.Fatal("restart ledger", err)
	}
	config := s.config
	config.Session = "other"
	other, err := newMCPService(s.h, config)
	if err != nil {
		t.Fatal(err)
	}
	defer other.close()
	rows, err := mcpInvoke(t, other, "JOBS", M{})
	if err != nil || len(rows.([]M)) != 0 {
		t.Fatal("foreign jobs leaked", rows, err)
	}
}
func TestMCPBrowserPeerIsolation(t *testing.T) {
	s := mcpFixture(t, "browser", "write")
	var output bytes.Buffer
	browser := &mcpPeer{host: s.h, client: newHost(&output)}
	defer browser.close()
	attacker := &mcpPeer{host: s.h, client: newHost(io.Discard)}
	defer attacker.close()
	register := func(peer *mcpPeer, id string) {
		_, err := peer.dispatch(Request{Action: "MCP_BROWSER_REGISTER", Payload: mcpJSON(M{"id": id, "enabled": true, "write": true})})
		if err != nil {
			t.Fatal(err)
		}
	}
	register(browser, "profile-01234567890")
	spec, _ := mcpSpecByName("nxe_browser_context")
	done := make(chan error, 1)
	go func() { _, err := s.call(context.Background(), spec, M{}); done <- err }()
	var ticket string
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		s.h.mcpBrowser.mu.Lock()
		for id := range s.h.mcpBrowser.pending {
			ticket = id
		}
		s.h.mcpBrowser.mu.Unlock()
		if ticket != "" {
			break
		}
		time.Sleep(time.Millisecond)
	}
	if ticket == "" {
		t.Fatal("no pending request")
	}
	if _, err := attacker.dispatch(Request{Action: "MCP_BROWSER_REPLY", Payload: mcpJSON(M{"ticket": ticket, "value": M{"forged": true}})}); err == nil {
		t.Fatal("foreign reply accepted")
	}
	if _, err := browser.dispatch(Request{Action: "MCP_SCOPED_CALL", Payload: mcpJSON(M{"ticket": ticket, "action": "FS_STAT", "arguments": M{"path": t.TempDir()}})}); err == nil {
		t.Fatal("browser bypassed scope")
	}
	if _, err := browser.dispatch(Request{Action: "MCP_BROWSER_REPLY", Payload: mcpJSON(M{"ticket": ticket, "value": M{"ok": true}})}); err != nil {
		t.Fatal(err)
	}
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	register(attacker, "profile-another-0123")
	if _, err := s.call(context.Background(), spec, M{}); err == nil {
		t.Fatal("ambiguous profile")
	}
	// Verify framing remained Native Messaging on the private worker link.
	browser.client.writeMu.Lock()
	defer browser.client.writeMu.Unlock()
	data := output.Bytes()
	if len(data) < 4 || int(binary.LittleEndian.Uint32(data[:4])) != len(data)-4 {
		t.Fatal("invalid native frame")
	}
}

func TestMCPWatchAndUploadOwnership(t *testing.T) {
	s := mcpFixture(t, "write")
	root := s.config.Roots[0]
	if _, err := mcpInvoke(t, s, "FS_WATCH", M{"paths": []any{root}}); err != nil {
		t.Fatal(err)
	}
	if _, err := mcpInvoke(t, s, "FS_UPLOAD", M{"path": root, "name": "binary.bin", "offset": 0, "data": "YQ==", "final": false}); err != nil {
		t.Fatal(err)
	}
	other, err := newMCPService(s.h, s.config)
	if err != nil {
		t.Fatal(err)
	}
	defer other.close()
	if _, err := mcpInvoke(t, other, "FS_UPLOAD", M{"path": root, "name": "binary.bin", "offset": 1, "data": "Yg==", "final": true}); err == nil {
		t.Fatal("foreign upload accepted")
	}
	if _, err := mcpInvoke(t, s, "FS_UPLOAD", M{"path": root, "name": "binary.bin", "offset": 1, "data": "Yg==", "final": true}); err != nil {
		t.Fatal(err)
	}
	content, err := os.ReadFile(filepath.Join(root, "binary.bin"))
	if err != nil || string(content) != "ab" {
		t.Fatal(string(content), err)
	}
	changes := 0
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		result, err := mcpInvoke(t, s, "FS_CHANGES", M{})
		if err != nil {
			t.Fatal(err)
		}
		changes += len(result.(M)["changes"].([]M))
		if changes > 0 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if changes == 0 {
		t.Fatal("no filesystem notifications")
	}
	if _, err := mcpInvoke(t, s, "FS_WATCH", M{"paths": []any{}}); err != nil {
		t.Fatal(err)
	}
}

func TestMCPRemoteScopeAndSFTP(t *testing.T) {
	h, c, profile := connectedRemoteHost(t)
	if err := c.sftp.Mkdir("/allowed"); err != nil {
		t.Fatal(err)
	}
	if err := c.sftp.Mkdir("/private"); err != nil {
		t.Fatal(err)
	}
	file, err := c.sftp.Create("/allowed/a.txt")
	if err != nil {
		t.Fatal(err)
	}
	file.Write([]byte("remote"))
	file.Close()
	if err := c.sftp.Symlink("/private", "/allowed/escape"); err != nil {
		t.Fatal(err)
	}
	config := mcpConfig{Roots: []string{t.TempDir()}, RemoteRoots: []string{remoteLocation(profile.ID, "/allowed")}, Capabilities: []string{"remote", "write"}, Session: randomID()}
	s, err := newMCPService(h, config)
	if err != nil {
		t.Fatal(err)
	}
	defer s.close()
	if _, err := mcpInvoke(t, s, "FS_READ", M{"path": remoteLocation(profile.ID, "/allowed/a.txt")}); err != nil {
		t.Fatal(err)
	}
	if _, err := mcpInvoke(t, s, "FS_LIST_DIR", M{"path": remoteLocation(profile.ID, "/private")}); err == nil {
		t.Fatal("remote scope escape")
	}
	if _, err := mcpInvoke(t, s, "FS_STAT", M{"path": remoteLocation(profile.ID, "/allowed/escape")}); err == nil {
		t.Fatal("remote symlink escape")
	}
	profiles, err := mcpInvoke(t, s, "REMOTE_PROFILES", M{})
	if err != nil || len(profiles.([]M)) != 1 {
		t.Fatal(profiles, err)
	}
}
