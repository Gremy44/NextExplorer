package main

import (
	"encoding/json"
	"fmt"
	"net"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
)

const remoteScheme = "nxe-remote://"

var remoteID = regexp.MustCompile(`^[a-zA-Z0-9_-]{8,80}$`)

type remoteProfile struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Protocol    string `json:"protocol"`
	Host        string `json:"host"`
	Port        int    `json:"port"`
	Username    string `json:"username"`
	Root        string `json:"root"`
	KeyFile     string `json:"keyFile,omitempty"`
	Fingerprint string `json:"fingerprint,omitempty"`
	Secret      string `json:"secret,omitempty"`
}
type remotePayload struct {
	Profile            remoteProfile `json:"profile"`
	ID                 string        `json:"id"`
	Password           string        `json:"password"`
	Remember           bool          `json:"remember"`
	ConfirmFingerprint string        `json:"confirmFingerprint"`
	AllowPlainFTP      bool          `json:"allowPlainFTP"`
	Path               string        `json:"path"`
	Mode               uint32        `json:"mode"`
	Expected           *Entry        `json:"expected"`
}
type remoteHub struct {
	mu       sync.Mutex
	file     string
	profiles map[string]remoteProfile
	sessions map[string]*remoteConnection
}

func isRemotePath(value string) bool { return strings.HasPrefix(value, remoteScheme) }
func remoteLocation(id, directory string) string {
	return (&url.URL{Scheme: "nxe-remote", Host: id, Path: path.Clean("/" + directory)}).String()
}
func parseRemoteLocation(value string) (string, string, error) {
	u, err := url.Parse(value)
	if err != nil || u.Scheme != "nxe-remote" || !remoteID.MatchString(u.Host) || u.User != nil || u.RawQuery != "" || u.Fragment != "" || strings.ContainsAny(u.Path, "\x00\r\n\\") || len(u.Path) > 8192 {
		return "", "", fmt.Errorf("chemin distant invalide")
	}
	return u.Host, path.Clean("/" + u.Path), nil
}
func validateRemoteProfile(p remoteProfile) (remoteProfile, error) {
	p.Host = strings.TrimSpace(p.Host)
	p.Label = strings.TrimSpace(p.Label)
	p.Username = strings.TrimSpace(p.Username)
	if p.ID == "" {
		p.ID = randomID()
	}
	if !remoteID.MatchString(p.ID) || len(p.Label) < 1 || len(p.Label) > 80 || strings.ContainsAny(p.Label, "\x00\r\n\t") || len(p.Host) < 1 || len(p.Host) > 253 || strings.ContainsAny(p.Host, "/@\\\x00\r\n\t ") || strings.ContainsAny(p.Username, "\x00\r\n") || p.Username == "" || len(p.Username) > 128 {
		return p, fmt.Errorf("nom, serveur ou utilisateur invalide")
	}
	if strings.Contains(p.Host, ":") && net.ParseIP(p.Host) == nil {
		return p, fmt.Errorf("indiquez le port dans son champ dédié")
	}
	if p.Protocol != "sftp" && p.Protocol != "ftp" && p.Protocol != "ftps" {
		return p, fmt.Errorf("protocole distant invalide")
	}
	if p.Port == 0 {
		if p.Protocol == "sftp" {
			p.Port = 22
		} else {
			p.Port = 21
		}
	}
	if p.Port < 1 || p.Port > 65535 || len(p.Root) > 4096 || strings.ContainsAny(p.Root, "\x00\r\n\\") {
		return p, fmt.Errorf("port ou dossier distant invalide")
	}
	if p.Root == "" {
		p.Root = "/"
	}
	if !strings.HasPrefix(p.Root, "/") {
		return p, fmt.Errorf("le dossier distant doit être un chemin absolu")
	}
	p.Root = path.Clean(p.Root)
	if len(p.KeyFile) > 4096 || strings.ContainsAny(p.KeyFile, "\x00\r\n") || len(p.Fingerprint) > 200 {
		return p, fmt.Errorf("clé SSH invalide")
	}
	if p.KeyFile != "" {
		if _, err := validPath(p.KeyFile); err != nil {
			return p, fmt.Errorf("chemin local absolu requis pour la clé privée")
		}
	}
	return p, nil
}
func newRemoteHub(file string) (*remoteHub, error) {
	hub := &remoteHub{file: file, profiles: map[string]remoteProfile{}, sessions: map[string]*remoteConnection{}}
	data, err := os.ReadFile(file)
	if os.IsNotExist(err) {
		return hub, nil
	}
	if err != nil {
		return nil, err
	}
	if len(data) > 256*1024 {
		return nil, fmt.Errorf("carnet de connexions trop volumineux")
	}
	var saved struct {
		Version  int             `json:"version"`
		Profiles []remoteProfile `json:"profiles"`
	}
	if json.Unmarshal(data, &saved) != nil || saved.Version != 1 || len(saved.Profiles) > 50 {
		return nil, fmt.Errorf("carnet de connexions invalide, fichier conservé")
	}
	for _, profile := range saved.Profiles {
		if !remoteID.MatchString(profile.ID) {
			return nil, fmt.Errorf("identifiant de connexion enregistré invalide")
		}
		p, err := validateRemoteProfile(profile)
		if err != nil {
			return nil, err
		}
		if _, ok := hub.profiles[p.ID]; ok {
			return nil, fmt.Errorf("connexion dupliquée")
		}
		hub.profiles[p.ID] = p
	}
	return hub, nil
}
func (h *Host) remoteHub() (*remoteHub, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.remote != nil {
		return h.remote, nil
	}
	root, err := os.UserConfigDir()
	if err != nil {
		return nil, err
	}
	hub, err := newRemoteHub(filepath.Join(root, "NextExplorer", "remote", "connections.json"))
	if err == nil {
		h.remote = hub
	}
	return hub, err
}
func (hub *remoteHub) save() error {
	profiles := []remoteProfile{}
	for _, p := range hub.profiles {
		profiles = append(profiles, p)
	}
	return atomicJSON(hub.file, M{"version": 1, "profiles": profiles}, 256*1024)
}
func (hub *remoteHub) publicProfiles() []M {
	result := []M{}
	for _, p := range hub.profiles {
		connected := hub.sessions[p.ID] != nil && !hub.sessions[p.ID].closed.Load()
		secret := p.Secret != ""
		p.Secret = ""
		result = append(result, M{"profile": p, "connected": connected, "hasSecret": secret})
	}
	sort.Slice(result, func(i, j int) bool {
		return strings.ToLower(result[i]["profile"].(remoteProfile).Label) < strings.ToLower(result[j]["profile"].(remoteProfile).Label)
	})
	return result
}
func remoteInPayload(p Payload) bool {
	if isRemotePath(p.Path) || isRemotePath(p.Destination) {
		return true
	}
	for _, value := range p.Paths {
		if isRemotePath(value) {
			return true
		}
	}
	return false
}
func remoteIdentity(p remoteProfile) string {
	data, _ := json.Marshal([]any{p.Protocol, p.Host, p.Port, p.Username, p.Fingerprint})
	return string(data)
}
func (h *Host) remoteBusy(id string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.current != nil && h.current.Kind == "remote" && h.current.payload.RemoteServers[id] != ""
}
func (h *Host) checkRemoteIdentity(p Payload) error {
	hub, err := h.remoteHub()
	if err != nil {
		return err
	}
	hub.mu.Lock()
	defer hub.mu.Unlock()
	if len(p.RemoteServers) == 0 {
		return fmt.Errorf("identité du serveur absente de la tâche")
	}
	for id, identity := range p.RemoteServers {
		profile, exists := hub.profiles[id]
		if !exists || identity == "" || identity != remoteIdentity(profile) {
			return fmt.Errorf("configuration du serveur modifiée depuis la mise en file : transfert refusé")
		}
	}
	return nil
}
