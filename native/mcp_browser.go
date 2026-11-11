package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"sync"
	"time"
)

// The private worker pipe supplies peer identity. Browser replies are sent only
// to the requesting peer, never broadcast along with filesystem events.
type mcpPeer struct {
	host, client *Host
	mu           sync.Mutex
	service      *mcpService
}
type mcpBrowserProfile struct {
	peer     *mcpPeer
	id, name string
	write    bool
}
type mcpBrowserReply struct {
	value any
	err   error
}
type mcpBrowserPending struct {
	peer     *mcpPeer
	service  *mcpService
	reply    chan mcpBrowserReply
	deadline time.Time
}
type mcpBrowserBroker struct {
	mu       sync.Mutex
	profiles map[*mcpPeer]mcpBrowserProfile
	pending  map[string]*mcpBrowserPending
}

func newMCPBrowserBroker() *mcpBrowserBroker {
	return &mcpBrowserBroker{profiles: map[*mcpPeer]mcpBrowserProfile{}, pending: map[string]*mcpBrowserPending{}}
}
func (p *mcpPeer) close() {
	b := p.host.mcpBrowser
	b.mu.Lock()
	delete(b.profiles, p)
	for ticket, wait := range b.pending {
		if wait.peer == p {
			select {
			case wait.reply <- mcpBrowserReply{err: fmt.Errorf("profil navigateur déconnecté ; vérifier l'état avant de répéter une écriture")}:
			default:
			}
			delete(b.pending, ticket)
		}
	}
	b.mu.Unlock()
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.service != nil {
		p.service.close()
	}
}
func (p *mcpPeer) dispatch(r Request) (any, error) {
	switch r.Action {
	case "MCP_CALL":
		var input mcpEnvelope
		if err := strictMCPJSON(r.Payload, &input); err != nil {
			return nil, err
		}
		p.mu.Lock()
		if p.service == nil {
			var err error
			p.service, err = newMCPService(p.host, input.Config)
			if err != nil {
				p.mu.Unlock()
				return nil, err
			}
		}
		c, err := normalizeMCPConfig(input.Config)
		service := p.service
		p.mu.Unlock()
		if err != nil {
			return nil, err
		}
		if !reflect.DeepEqual(c, service.config) {
			return nil, fmt.Errorf("configuration MCP modifiée sur une connexion active")
		}
		spec, ok := mcpSpecByName(input.Tool)
		if !ok {
			return nil, fmt.Errorf("outil MCP inconnu")
		}
		if err := validateMCPArgs(spec, input.Arguments); err != nil {
			return nil, err
		}
		return service.call(context.Background(), spec, input.Arguments)
	case "MCP_BROWSER_REGISTER":
		var input struct {
			ID      string `json:"id"`
			Name    string `json:"name"`
			Enabled bool   `json:"enabled"`
			Write   bool   `json:"write"`
		}
		if err := strictMCPJSON(r.Payload, &input); err != nil {
			return nil, err
		}
		b := p.host.mcpBrowser
		b.mu.Lock()
		defer b.mu.Unlock()
		if !input.Enabled {
			delete(b.profiles, p)
			for ticket, wait := range b.pending {
				if wait.peer == p {
					select {
					case wait.reply <- mcpBrowserReply{err: fmt.Errorf("accès MCP désactivé dans le navigateur")}:
					default:
					}
					delete(b.pending, ticket)
				}
			}
			return true, nil
		}
		if len(input.ID) < 16 || len(input.ID) > 100 || len(input.Name) > 100 {
			return nil, fmt.Errorf("identifiant de profil invalide")
		}
		b.profiles[p] = mcpBrowserProfile{p, input.ID, input.Name, input.Write}
		return M{"id": input.ID}, nil
	case "MCP_BROWSER_REPLY":
		var input struct {
			Ticket string `json:"ticket"`
			Value  any    `json:"value"`
			Error  string `json:"error"`
		}
		if err := strictMCPJSON(r.Payload, &input); err != nil {
			return nil, err
		}
		b := p.host.mcpBrowser
		b.mu.Lock()
		defer b.mu.Unlock()
		wait := b.pending[input.Ticket]
		if wait == nil || wait.peer != p || time.Now().After(wait.deadline) {
			return nil, fmt.Errorf("requête navigateur expirée ou étrangère")
		}
		var err error
		if input.Error != "" {
			err = fmt.Errorf("%s", input.Error)
		}
		select {
		case wait.reply <- mcpBrowserReply{input.Value, err}:
		default:
			return nil, fmt.Errorf("réponse déjà reçue")
		}
		delete(b.pending, input.Ticket)
		return true, nil
	case "MCP_SCOPE_CHECK":
		var input struct {
			Ticket string   `json:"ticket"`
			Paths  []string `json:"paths"`
		}
		if err := strictMCPJSON(r.Payload, &input); err != nil {
			return nil, err
		}
		b := p.host.mcpBrowser
		b.mu.Lock()
		wait := b.pending[input.Ticket]
		valid := wait != nil && wait.peer == p && time.Now().Before(wait.deadline)
		b.mu.Unlock()
		if !valid || len(input.Paths) > 2000 {
			return nil, fmt.Errorf("vérification de périmètre invalide ou expirée")
		}
		result := map[string]bool{}
		for _, path := range input.Paths {
			result[path] = wait.service.config.path(path) == nil
		}
		return result, nil
	case "MCP_SCOPED_CALL":
		var input struct {
			Ticket    string         `json:"ticket"`
			Action    string         `json:"action"`
			Arguments map[string]any `json:"arguments"`
		}
		if err := strictMCPJSON(r.Payload, &input); err != nil {
			return nil, err
		}
		b := p.host.mcpBrowser
		b.mu.Lock()
		wait := b.pending[input.Ticket]
		valid := wait != nil && wait.peer == p && time.Now().Before(wait.deadline)
		b.mu.Unlock()
		if !valid {
			return nil, fmt.Errorf("requête navigateur expirée ou étrangère")
		}
		spec, ok := mcpSpecByName("nxe_" + lowerMCPAction(input.Action))
		if !ok || spec.Kind != "native" {
			return nil, fmt.Errorf("action native non exposée")
		}
		if err := validateMCPArgs(spec, input.Arguments); err != nil {
			return nil, err
		}
		return wait.service.call(context.Background(), spec, input.Arguments)
	default:
		return nil, fmt.Errorf("action MCP interne inconnue")
	}
}
func (b *mcpBrowserBroker) call(ctx context.Context, service *mcpService, spec mcpSpec, args map[string]any) (any, error) {
	if b == nil {
		return nil, fmt.Errorf("pont navigateur indisponible")
	}
	b.mu.Lock()
	targets := []mcpBrowserProfile{}
	for _, profile := range b.profiles {
		if service.config.BrowserProfile == "" || profile.id == service.config.BrowserProfile {
			targets = append(targets, profile)
		}
	}
	if len(targets) != 1 {
		b.mu.Unlock()
		return nil, fmt.Errorf("%d profils MCP connectés : activer MCP dans Réglages → Connexions et préciser browserProfile si nécessaire", len(targets))
	}
	profile := targets[0]
	if spec.writes() && !profile.write {
		b.mu.Unlock()
		return nil, fmt.Errorf("modifications MCP désactivées dans le profil navigateur")
	}
	if len(b.pending) >= 16 {
		b.mu.Unlock()
		return nil, fmt.Errorf("trop de requêtes navigateur en cours")
	}
	ticket := randomID()
	wait := &mcpBrowserPending{profile.peer, service, make(chan mcpBrowserReply, 1), time.Now().Add(50 * time.Second)}
	b.pending[ticket] = wait
	b.mu.Unlock()
	defer func() { b.mu.Lock(); delete(b.pending, ticket); b.mu.Unlock() }()
	profile.peer.client.send(M{"event": "MCP_BROWSER_REQUEST", "data": M{"ticket": ticket, "profile": profile.id, "action": spec.Action, "arguments": args, "roots": service.config.Roots, "remoteRoots": service.config.RemoteRoots, "capabilities": service.config.Capabilities, "deadline": wait.deadline.UnixMilli()}})
	timer := time.NewTimer(time.Until(wait.deadline))
	defer timer.Stop()
	select {
	case reply := <-wait.reply:
		return reply.value, reply.err
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-timer.C:
		return nil, fmt.Errorf("navigateur sans réponse ; vérifier l'état avant de répéter une écriture")
	}
}

func strictMCPJSON(raw []byte, target any) error {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	return dec.Decode(target)
}
func lowerMCPAction(action string) string { return strings.ToLower(action) }
