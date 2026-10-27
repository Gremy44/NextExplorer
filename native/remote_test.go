package main

import (
	"bufio"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

func remoteTestServer(t *testing.T, shellCommands ...chan string) (remoteProfile, *atomic.Int32) {
	t.Helper()
	_, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := ssh.NewSignerFromKey(private)
	if err != nil {
		t.Fatal(err)
	}
	attempts := &atomic.Int32{}
	config := &ssh.ServerConfig{PasswordCallback: func(meta ssh.ConnMetadata, password []byte) (*ssh.Permissions, error) {
		attempts.Add(1)
		if meta.User() != "tester" || string(password) != "test-secret" {
			return nil, fmt.Errorf("authentication denied")
		}
		return nil, nil
	}}
	config.AddHostKey(signer)
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	var sockets sync.Map
	var wg sync.WaitGroup
	handlers := sftp.InMemHandler()
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			socket, err := listener.Accept()
			if err != nil {
				return
			}
			sockets.Store(socket, true)
			wg.Add(1)
			go func() {
				defer wg.Done()
				defer sockets.Delete(socket)
				defer socket.Close()
				connection, channels, requests, err := ssh.NewServerConn(socket, config)
				if err != nil {
					return
				}
				defer connection.Close()
				go ssh.DiscardRequests(requests)
				for channel := range channels {
					if channel.ChannelType() != "session" {
						channel.Reject(ssh.UnknownChannelType, "session only")
						continue
					}
					stream, requests, err := channel.Accept()
					if err != nil {
						continue
					}
					wg.Add(1)
					go func() {
						defer wg.Done()
						defer stream.Close()
						for request := range requests {
							if len(shellCommands) > 0 {
								if request.Type == "pty-req" || request.Type == "window-change" {
									request.Reply(true, nil)
									continue
								}
								if request.Type == "exec" {
									var payload struct{ Command string }
									if ssh.Unmarshal(request.Payload, &payload) != nil {
										request.Reply(false, nil)
										continue
									}
									shellCommands[0] <- payload.Command
									request.Reply(true, nil)
									marker := regexp.MustCompile(`NextExplorer=([^;]+);`).FindStringSubmatch(payload.Command)
									if len(marker) == 2 {
										_, _ = io.WriteString(stream, "\x1b]777;NextExplorer="+marker[1]+";"+base64.StdEncoding.EncodeToString([]byte("/a '$(echo unsafe)")))
										_, _ = io.WriteString(stream, "\aSSH test$ ")
									}
									go io.Copy(io.Discard, stream)
									continue
								}
							}
							var subsystem struct{ Name string }
							if request.Type == "subsystem" && ssh.Unmarshal(request.Payload, &subsystem) == nil && subsystem.Name == "sftp" {
								request.Reply(true, nil)
								server := sftp.NewRequestServer(stream, handlers)
								_ = server.Serve()
								_ = server.Close()
								return
							}
							request.Reply(false, nil)
						}
					}()
				}
			}()
		}
	}()
	t.Cleanup(func() {
		listener.Close()
		sockets.Range(func(key, value any) bool { key.(net.Conn).Close(); return true })
		wg.Wait()
	})
	address := listener.Addr().(*net.TCPAddr)
	return remoteProfile{ID: "test-server", Label: "Serveur test", Protocol: "sftp", Host: "127.0.0.1", Port: address.Port, Username: "tester", Root: "/", Fingerprint: ssh.FingerprintSHA256(signer.PublicKey())}, attempts
}
func connectedRemoteHost(t *testing.T) (*Host, *remoteConnection, remoteProfile) {
	t.Helper()
	profile, _ := remoteTestServer(t)
	connection, _, err := dialRemote(profile, "test-secret", "", nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(connection.Close)
	h := durableHost(t)
	h.remote = &remoteHub{file: filepath.Join(t.TempDir(), "connections.json"), profiles: map[string]remoteProfile{profile.ID: profile}, sessions: map[string]*remoteConnection{profile.ID: connection}}
	return h, connection, profile
}
func remoteRPC(t *testing.T, h *Host, action string, payload any) (any, error) {
	t.Helper()
	data, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	return h.dispatch(Request{ID: randomID(), Action: action, Payload: data})
}

func TestRemoteSSHTrustPrecedesAuthentication(t *testing.T) {
	profile, attempts := remoteTestServer(t)
	fingerprint := profile.Fingerprint
	profile.Fingerprint = ""
	c, challenge, err := dialRemote(profile, "test-secret", "", nil)
	if c != nil || err == nil || challenge != fingerprint || attempts.Load() != 0 {
		t.Fatalf("untrusted server reached authentication: %v %s %v", c, challenge, err)
	}
	c, _, err = dialRemote(profile, "test-secret", fingerprint, nil)
	if err != nil {
		t.Fatal(err)
	}
	c.Close()
	if attempts.Load() != 1 {
		t.Fatal("accepted key did not authenticate")
	}
	profile.Fingerprint = "SHA256:changed-key"
	before := attempts.Load()
	c, challenge, err = dialRemote(profile, "test-secret", fingerprint, nil)
	if c != nil || err == nil || challenge != "" || attempts.Load() != before {
		t.Fatal("changed key bypassed stored pin")
	}
	profile.Fingerprint = fingerprint
	c, _, err = dialRemote(profile, "wrong-password", "", nil)
	if c != nil || err == nil {
		t.Fatal("bad credentials accepted")
	}
}
func TestRemoteProfileStoreAndPaths(t *testing.T) {
	id := "test-server"
	directory := "/Images été/#version%/a?.txt"
	location := remoteLocation(id, directory)
	parsed, got, err := parseRemoteLocation(location)
	if err != nil || parsed != id || got != directory {
		t.Fatalf("path round trip: %s %v", got, err)
	}
	for _, bad := range []string{"file:///etc/passwd", "nxe-remote://bad/x", "nxe-remote://test-server/a?secret=1", "nxe-remote://test-server/a#b", "nxe-remote://user@/x", "nxe-remote://test-server/%00", "nxe-remote://test-server/a%5Cb"} {
		if _, _, err := parseRemoteLocation(bad); err == nil {
			t.Errorf("accepted %q", bad)
		}
	}
	h := newHost(io.Discard)
	file := filepath.Join(t.TempDir(), "connections.json")
	h.remote = &remoteHub{file: file, profiles: map[string]remoteProfile{}, sessions: map[string]*remoteConnection{}}
	profile := remoteProfile{ID: id, Label: "Test", Host: "example.test", Port: 22, Username: "tester", Protocol: "sftp", Root: "/home/tester"}
	if _, err := remoteRPC(t, h, "REMOTE_PROFILE_SAVE", remotePayload{Profile: profile, Password: "private-value", Remember: true}); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(file)
	if err != nil || strings.Contains(string(data), "private-value") {
		t.Fatal("secret stored as plaintext", err)
	}
	public, err := remoteRPC(t, h, "REMOTE_PROFILES", remotePayload{})
	if err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(public)
	if strings.Contains(string(encoded), "secret\"") || strings.Contains(string(encoded), "private-value") {
		t.Fatal("secret exposed to UI")
	}
	hub, err := newRemoteHub(file)
	if err != nil {
		t.Fatal(err)
	}
	secret, err := unprotectRemoteSecret(hub.profiles[id].Secret)
	if err != nil || secret != "private-value" {
		t.Fatal("protected secret unavailable", err)
	}
	profile.Host = "new.example.test"
	if _, err := remoteRPC(t, h, "REMOTE_PROFILE_SAVE", remotePayload{Profile: profile, Remember: true}); err != nil {
		t.Fatal(err)
	}
	if h.remote.profiles[id].Secret != "" || h.remote.profiles[id].Fingerprint != "" {
		t.Fatal("endpoint change retained trust or password")
	}
	if err := os.WriteFile(file, []byte("invalid"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := newRemoteHub(file); err == nil {
		t.Fatal("corrupt store replaced")
	}
	data, _ = os.ReadFile(file)
	if string(data) != "invalid" {
		t.Fatal("corrupt data lost")
	}
}
func TestRemoteSFTPTransfersAndCollisionProtection(t *testing.T) {
	h, c, p := connectedRemoteHost(t)
	if err := c.sftp.Mkdir("/upload"); err != nil {
		t.Fatal(err)
	}
	local := t.TempDir()
	source := filepath.Join(local, "Documents")
	if err := os.MkdirAll(filepath.Join(source, "Sous-dossier"), 0755); err != nil {
		t.Fatal(err)
	}
	content := strings.Repeat("échantillon de données\n", 32000)
	if err := os.WriteFile(filepath.Join(source, "Sous-dossier", "été #%.txt"), []byte(content), 0600); err != nil {
		t.Fatal(err)
	}
	upload := Payload{Paths: []string{source}, Destination: remoteLocation(p.ID, "/upload"), Mode: "copy", Conflict: "rename"}
	result, err := h.startRemoteJob(upload)
	if err != nil {
		t.Fatal(err)
	}
	job := h.jobs[result["jobId"].(string)]
	awaitTask(t, job)
	remoteFile := "/upload/Documents/Sous-dossier/été #%.txt"
	reader, err := c.sftp.Open(remoteFile)
	if err != nil {
		t.Fatal(err)
	}
	data, _ := io.ReadAll(reader)
	reader.Close()
	if string(data) != content {
		t.Fatal("SFTP upload corrupted")
	}
	result, err = h.startRemoteJob(upload)
	if err != nil {
		t.Fatal(err)
	}
	awaitTask(t, h.jobs[result["jobId"].(string)])
	if _, err = c.sftp.Stat("/upload/Documents (1)"); err != nil {
		t.Fatal("collision did not preserve both", err)
	}
	download := t.TempDir()
	result, err = h.startRemoteJob(Payload{Paths: []string{remoteLocation(p.ID, "/upload/Documents")}, Destination: download, Mode: "copy", Conflict: "rename"})
	if err != nil {
		t.Fatal(err)
	}
	awaitTask(t, h.jobs[result["jobId"].(string)])
	data, err = os.ReadFile(filepath.Join(download, "Documents", "Sous-dossier", "été #%.txt"))
	if err != nil || string(data) != content {
		t.Fatal("SFTP round trip failed", err)
	}
	for _, mode := range []string{"move", "overwrite"} {
		payload := upload
		if mode == "move" {
			payload.Mode = mode
		} else {
			payload.Conflict = mode
		}
		if _, err := h.startRemoteJob(payload); err == nil {
			t.Fatal("destructive mode accepted")
		}
	}
	result, err = h.startRemoteJob(Payload{Paths: []string{source}, Destination: upload.Destination, Mode: "copy", Conflict: "skip"})
	if err != nil {
		t.Fatal(err)
	}
	awaitTask(t, h.jobs[result["jobId"].(string)])
	if _, err := c.sftp.Stat("/upload/Documents (2)"); !os.IsNotExist(err) {
		t.Fatal("skip created a duplicate")
	}
	files, err := os.ReadDir(h.durableDir)
	if err != nil {
		t.Fatal(err)
	}
	for _, file := range files {
		data, err := os.ReadFile(filepath.Join(h.durableDir, file.Name()))
		if err != nil || strings.Contains(string(data), "test-secret") {
			t.Fatal("job persisted credentials", err)
		}
	}
}
func TestRemoteSFTPOperationsAndLocalToolsBlocked(t *testing.T) {
	h, c, p := connectedRemoteHost(t)
	root := remoteLocation(p.ID, "/")
	if _, err := remoteRPC(t, h, "FS_MKDIR", Payload{Path: root, Name: "Images été"}); err != nil {
		t.Fatal(err)
	}
	file, err := c.sftp.Create("/a.txt")
	if err != nil {
		t.Fatal(err)
	}
	file.Write([]byte("bonjour"))
	file.Close()
	value, err := remoteRPC(t, h, "FS_READ", Payload{Path: remoteLocation(p.ID, "/a.txt"), Offset: 1, Limit: 3})
	if err != nil {
		t.Fatal(err)
	}
	if value.(M)["data"] != base64.StdEncoding.EncodeToString([]byte("onj")) {
		t.Fatal("chunk read incorrect")
	}
	for _, action := range []string{"OS_OPEN", "FS_WRITE", "FS_TRASH", "IMAGE_PREVIEW", "CONVERT", "METADATA", "TERMINAL_OPEN"} {
		if _, err := remoteRPC(t, h, action, Payload{Path: root, Owner: strings.Repeat("a", 20), Columns: 80, Rows: 24}); err == nil {
			t.Errorf("local action accepted: %s", action)
		}
	}
	path := remoteLocation(p.ID, "/a.txt")
	entry, err := h.locationStat(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := remoteRPC(t, h, "REMOTE_DELETE", remotePayload{Path: path}); err == nil {
		t.Fatal("deletion without source snapshot accepted")
	}
	if _, err := remoteRPC(t, h, "REMOTE_CHMOD", remotePayload{Path: path, Expected: &entry, Mode: 0644}); err != nil {
		t.Fatal(err)
	}
	entry, err = h.locationStat(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := remoteRPC(t, h, "REMOTE_DELETE", remotePayload{Path: path, Expected: &entry}); err != nil {
		t.Fatal(err)
	}
	if _, err := c.sftp.Stat("/a.txt"); !os.IsNotExist(err) {
		t.Fatal("file was not deleted")
	}
	if _, err := remoteRPC(t, h, "REMOTE_DELETE", remotePayload{Path: root}); err == nil {
		t.Fatal("root deletion accepted")
	}
	if _, err := remoteRPC(t, h, "REMOTE_TERMINAL_OPEN", Payload{Path: root, Owner: strings.Repeat("a", 20), Columns: 80, Rows: 24}); err == nil {
		t.Fatal("SFTP-only server falsely offered a shell")
	}
}
func TestRemoteInterruptionAndShellQuoting(t *testing.T) {
	h, _, p := connectedRemoteHost(t)
	source := filepath.Join(t.TempDir(), "paused.txt")
	if err := os.WriteFile(source, []byte("paused"), 0600); err != nil {
		t.Fatal(err)
	}
	result, err := h.startRemoteJob(Payload{Paths: []string{source}, Destination: remoteLocation(p.ID, "/"), Mode: "copy", Conflict: "rename", Paused: true})
	if err != nil {
		t.Fatal(err)
	}
	job := h.jobs[result["jobId"].(string)]
	job.control("cancel")
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		h.mu.Lock()
		finished := h.current != job && !job.pending
		h.mu.Unlock()
		if finished {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if job.canRecover() {
		t.Fatal("remote job can replay after interruption")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	testJob := &Job{ctx: ctx, host: h}
	if _, err := testJob.remoteCopy(io.Discard, strings.NewReader("secret"), make([]byte, 16)); err == nil {
		t.Fatal("cancelled copy continued")
	}
	if got := shellQuote("/tmp/a'; touch injected; '"); got != "'/tmp/a'\"'\"'; touch injected; '\"'\"''" {
		t.Fatalf("unsafe POSIX quoting: %s", got)
	}
	s := &terminalSession{remoteID: p.ID, path: remoteLocation(p.ID, "/Case"), pending: remoteLocation(p.ID, "/case"), marker: "\x1b]777;NextExplorer=token;", input: make(chan terminalInput, 1)}
	s.atPrompt = true
	s.syncDirectory()
	command := <-s.input
	if command.data != " cd -- '/case'\r" {
		t.Fatalf("SSH used local/case-insensitive cd: %q", command.data)
	}
	s.pending = ""
	s.queued = 0
	s.syncing = ""
	s.receive([]byte(s.marker + base64.StdEncoding.EncodeToString([]byte("/case")) + "\a"))
	if s.path != remoteLocation(p.ID, "/case") || !s.atPrompt {
		t.Fatal("SSH prompt lost remote identity")
	}
}

func TestRemoteFTPSRejectsUntrustedCertificate(t *testing.T) {
	_, key, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	certificate := &x509.Certificate{SerialNumber: big.NewInt(1), NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour), DNSNames: []string{"localhost"}, IPAddresses: []net.IP{net.ParseIP("127.0.0.1")}, KeyUsage: x509.KeyUsageDigitalSignature, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}}
	der, err := x509.CreateCertificate(rand.Reader, certificate, certificate, key.Public(), key)
	if err != nil {
		t.Fatal(err)
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	finished := make(chan struct{})
	go func() {
		defer close(finished)
		socket, err := listener.Accept()
		if err != nil {
			return
		}
		defer socket.Close()
		_ = socket.SetDeadline(time.Now().Add(5 * time.Second))
		_, _ = io.WriteString(socket, "220 Test FTP ready\r\n")
		line, err := bufio.NewReader(socket).ReadString('\n')
		if err != nil || strings.TrimSpace(line) != "AUTH TLS" {
			return
		}
		_, _ = io.WriteString(socket, "234 Begin TLS\r\n")
		secure := tls.Server(socket, &tls.Config{MinVersion: tls.VersionTLS12, Certificates: []tls.Certificate{{Certificate: [][]byte{der}, PrivateKey: key}}})
		_ = secure.Handshake()
	}()
	p := remoteProfile{ID: "test-ftps", Label: "FTPS", Protocol: "ftps", Host: "127.0.0.1", Port: listener.Addr().(*net.TCPAddr).Port, Username: "tester", Root: "/"}
	c, _, err := dialRemote(p, "do-not-send-to-untrusted-cert", "", nil)
	if c != nil || err == nil {
		if c != nil {
			c.Close()
		}
		t.Fatal("untrusted FTPS certificate accepted")
	}
	if !strings.Contains(err.Error(), "certificat TLS") {
		t.Fatalf("FTPS failed for an unexpected reason: %v", err)
	}
	<-finished
	h := newHost(io.Discard)
	p.Protocol = "ftp"
	h.remote = &remoteHub{profiles: map[string]remoteProfile{p.ID: p}, sessions: map[string]*remoteConnection{}}
	if _, err := remoteRPC(t, h, "REMOTE_CONNECT", remotePayload{ID: p.ID, Password: "never-sent"}); err == nil || !strings.Contains(err.Error(), "explicitement") {
		t.Fatal("plain FTP was not gated before network access")
	}
}

func TestRemotePaginationAndRenameSnapshots(t *testing.T) {
	h, c, p := connectedRemoteHost(t)
	root := remoteLocation(p.ID, "/")
	for _, name := range []string{"a.txt", "b.txt", "c.txt"} {
		file, err := c.sftp.Create("/" + name)
		if err != nil {
			t.Fatal(err)
		}
		file.Write([]byte(name))
		file.Close()
	}
	value, err := remoteRPC(t, h, "FS_LIST_DIR", Payload{Path: root, Limit: 1, SortBy: "size", SortOrder: "desc"})
	if err != nil {
		t.Fatal(err)
	}
	first := value.(M)
	if len(first["entries"].([]Entry)) != 1 {
		t.Fatal("pagination ignored")
	}
	file, err := c.sftp.Create("/new.txt")
	if err != nil {
		t.Fatal(err)
	}
	file.Close()
	next, err := remoteRPC(t, h, "FS_LIST_DIR", Payload{Path: root, Snapshot: first["snapshot"].(string), Offset: 1, Limit: 500})
	if err != nil {
		t.Fatal(err)
	}
	if next.(M)["total"].(int) != 3 {
		t.Fatal("later page re-read mutable server state")
	}
	source := remoteLocation(p.ID, "/a.txt")
	entry, err := h.locationStat(source)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := remoteRPC(t, h, "FS_RENAME", Payload{Path: source, Name: "b.txt", Expected: &entry}); err == nil {
		t.Fatal("rename overwrote existing destination")
	}
	if _, err := remoteRPC(t, h, "FS_RENAME", Payload{Path: source, Name: "renamed.txt"}); err == nil {
		t.Fatal("rename accepted without snapshot")
	}
	if _, err := remoteRPC(t, h, "FS_RENAME", Payload{Path: source, Name: "renamed.txt", Expected: &entry}); err != nil {
		t.Fatal(err)
	}
	reader, err := c.sftp.Open("/b.txt")
	if err != nil {
		t.Fatal(err)
	}
	data, _ := io.ReadAll(reader)
	reader.Close()
	if string(data) != "b.txt" {
		t.Fatal("existing target changed")
	}
}

func TestRemoteSSHInteractiveSessionAndOwnership(t *testing.T) {
	commands := make(chan string, 1)
	p, _ := remoteTestServer(t, commands)
	c, _, err := dialRemote(p, "test-secret", "", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	directory := "/a '$(echo unsafe)"
	if err := c.sftp.Mkdir(directory); err != nil {
		t.Fatal(err)
	}
	h := durableHost(t)
	h.remote = &remoteHub{profiles: map[string]remoteProfile{p.ID: p}, sessions: map[string]*remoteConnection{p.ID: c}}
	owner := strings.Repeat("a", 20)
	location := remoteLocation(p.ID, directory)
	value, err := remoteRPC(t, h, "REMOTE_TERMINAL_OPEN", Payload{Path: location, Owner: owner, Columns: 80, Rows: 24})
	if err != nil {
		t.Fatal(err)
	}
	id := value.(M)["id"].(string)
	defer h.closeTerminals(owner)
	command := <-commands
	if !strings.HasPrefix(command, "cd -- "+shellQuote(directory)+" && ") || strings.Contains(command, "Set-Location") {
		t.Fatalf("unsafe remote shell command: %s", command)
	}
	deadline := time.Now().Add(2 * time.Second)
	ready := false
	for time.Now().Before(deadline) {
		value, err := remoteRPC(t, h, "REMOTE_TERMINAL_READ", Payload{Session: id, Owner: owner})
		if err != nil {
			t.Fatal(err)
		}
		if value.(M)["ready"] == true {
			if value.(M)["path"] != location {
				t.Fatal("console lost server identity")
			}
			ready = true
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if !ready {
		t.Fatal("remote prompt was not recognized")
	}
	if _, err := remoteRPC(t, h, "REMOTE_TERMINAL_WRITE", Payload{Session: id, Owner: strings.Repeat("b", 20), Data: "whoami\r"}); err == nil {
		t.Fatal("another view could write to SSH session")
	}
	if _, err := remoteRPC(t, h, "REMOTE_TERMINAL_SYNC", Payload{Session: id, Owner: owner, Path: remoteLocation("other-server", "/")}); err == nil {
		t.Fatal("SSH session followed another server")
	}
	if _, err := remoteRPC(t, h, "REMOTE_TERMINAL_CLOSE_OWNER", Payload{Owner: owner}); err != nil {
		t.Fatal(err)
	}
	if _, err := remoteRPC(t, h, "REMOTE_TERMINAL_READ", Payload{Session: id, Owner: owner}); err == nil {
		t.Fatal("closed SSH session survived owner cleanup")
	}
}

func TestRemotePublicationPreservesLateCollision(t *testing.T) {
	h, c, p := connectedRemoteHost(t)
	source := filepath.Join(t.TempDir(), "source.txt")
	if err := os.WriteFile(source, []byte("new-content"), 0600); err != nil {
		t.Fatal(err)
	}
	entry, err := statEntry(source)
	if err != nil {
		t.Fatal(err)
	}
	file, err := c.sftp.Create("/already-there.txt")
	if err != nil {
		t.Fatal(err)
	}
	file.Write([]byte("keep-original"))
	file.Close()
	job := preparedTask(t, h, "remote", Payload{Paths: []string{source}, Destination: remoteLocation(p.ID, "/"), Mode: "copy", Conflict: "rename"})
	if err := job.copyRemoteFile(remoteCopyItem{source: entry, target: remoteLocation(p.ID, "/already-there.txt")}); err == nil {
		t.Fatal("publication overwrote an existing destination")
	}
	reader, err := c.sftp.Open("/already-there.txt")
	if err != nil {
		t.Fatal(err)
	}
	data, _ := io.ReadAll(reader)
	reader.Close()
	if string(data) != "keep-original" {
		t.Fatal("late collision destroyed existing data")
	}
	entries, err := c.list("/")
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if strings.Contains(entry.Name, ".nxe-") {
			t.Fatal("temporary upload left behind after refused publication")
		}
	}
}

func TestRemoteQueuedCopyDoesNotFollowChangedServer(t *testing.T) {
	h, c, p := connectedRemoteHost(t)
	source := filepath.Join(t.TempDir(), "queued.txt")
	if err := os.WriteFile(source, []byte("private-content"), 0600); err != nil {
		t.Fatal(err)
	}
	result, err := h.startRemoteJob(Payload{Paths: []string{source}, Destination: remoteLocation(p.ID, "/"), Mode: "copy", Conflict: "rename", Paused: true})
	if err != nil {
		t.Fatal(err)
	}
	job := h.jobs[result["jobId"].(string)]
	defer job.control("cancel")
	deadline := time.Now().Add(2 * time.Second)
	for !h.remoteBusy(p.ID) && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	if !h.remoteBusy(p.ID) {
		t.Fatal("queued job did not start")
	}
	changed := p
	changed.Host = "different.example.test"
	if _, err := remoteRPC(t, h, "REMOTE_PROFILE_SAVE", remotePayload{Profile: changed}); err == nil {
		t.Fatal("active transfer allowed changing its server")
	}
	h.remote.mu.Lock()
	h.remote.profiles[p.ID] = changed
	h.remote.mu.Unlock()
	job.control("resume")
	deadline = time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		snapshot := job.snapshot()
		if snapshot["state"] == "error" {
			if !strings.Contains(snapshot["error"].(string), "modifiée") {
				t.Fatal(snapshot)
			}
			if _, err := c.sftp.Stat("/queued.txt"); !os.IsNotExist(err) {
				t.Fatal("copy wrote after identity changed")
			}
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("changed server was not rejected")
}

func TestRemoteSplitPaneConcurrentListings(t *testing.T) {
	h, _, p := connectedRemoteHost(t)
	payload, _ := json.Marshal(Payload{Path: remoteLocation(p.ID, "/"), Limit: 500})
	start := make(chan struct{})
	results := make(chan error, 2)
	for range 2 {
		go func() {
			<-start
			_, err := h.dispatch(Request{ID: randomID(), Action: "FS_LIST_DIR", Payload: payload})
			results <- err
		}()
	}
	close(start)
	for range 2 {
		if err := <-results; err != nil {
			t.Fatal("one split pane could not list its connected server", err)
		}
	}
}
