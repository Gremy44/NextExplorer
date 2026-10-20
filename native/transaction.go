package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// Separate from the bounded activity summary: never truncate paths or prune these
// records with the 20-entry UI history. An intent without a result is uncertain.
type transactionEvent struct {
	Version     int    `json:"version"`
	Step        int    `json:"step"`
	Phase       string `json:"phase"`
	Action      string `json:"action"`
	Source      string `json:"source,omitempty"`
	Destination string `json:"destination,omitempty"`
	Hash        string `json:"blake3,omitempty"`
	TrashRecord string `json:"trashRecord,omitempty"`
	Error       string `json:"error,omitempty"`
	Time        string `json:"time"`
	Mode        string `json:"mode,omitempty"`
	Conflict    string `json:"conflict,omitempty"`
	Merge       bool   `json:"merge,omitempty"`
}

func (j *Job) beginTransaction(p Payload) (func(error) error, error) {
	noop := func(err error) error { return err }
	if j.Kind != "transfer" {
		return noop, nil
	}
	event := transactionEvent{Action: "transfer", Phase: "begin", Mode: p.Mode, Conflict: p.Conflict, Merge: p.Merge}
	dir, _ := j.host.transactionDir(j.ID)
	_, beginErr := os.Stat(filepath.Join(dir, "00000000-begin.json"))
	if !(j.resuming && beginErr == nil) {
		if err := j.appendTransaction(event); err != nil {
			return nil, fmt.Errorf("transfert arrêté : journal transactionnel : %w", err)
		}
	}
	return func(operationErr error) error {
		event.Phase = "end"
		if operationErr != nil {
			event.Error = operationErr.Error()
		}
		if err := j.appendTransaction(event); err != nil {
			return fmt.Errorf("fin de transfert non enregistrée (opération : %v) : %w", operationErr, err)
		}
		return operationErr
	}, nil
}

func (j *Job) appendTransaction(event transactionEvent) error {
	if j.host == nil || j.host.journalDir == "" {
		return fmt.Errorf("journal transactionnel indisponible")
	}
	if filepath.Base(j.ID) != j.ID || j.ID == "" || j.ID == "." || j.ID == ".." {
		return fmt.Errorf("identifiant de tâche invalide")
	}
	dir := filepath.Join(j.host.journalDir, "transactions", j.ID)
	return writeTransactionEvent(dir, event)
}

func writeTransactionEvent(dir string, event transactionEvent) error {
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	event.Version = 1
	event.Time = time.Now().UTC().Format(time.RFC3339Nano)
	data, err := json.Marshal(event)
	if err != nil {
		return err
	}
	// Unique, exclusive files make a failed/torn write distinguishable from a
	// complete result. Never overwrite evidence from an earlier attempt.
	f, err := os.OpenFile(filepath.Join(dir, fmt.Sprintf("%08d-%s.json", event.Step, event.Phase)), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	_, err = f.Write(data)
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err == nil {
		err = closeErr
	}
	return err
}

func (j *Job) transaction(action, src, dst, hash, record string, mutate func() error) error {
	// Extraction and other jobs retain their existing semantics in this first lot.
	if j.Kind != "transfer" {
		return mutate()
	}
	j.transactionStep++
	event := transactionEvent{Step: j.transactionStep, Phase: "intent", Action: action, Source: src, Destination: dst, Hash: hash, TrashRecord: record}
	if err := j.appendTransaction(event); err != nil {
		return fmt.Errorf("transfert arrêté avant modification : journal transactionnel : %w", err)
	}
	mutationErr := mutate()
	event.Phase = "result"
	if mutationErr != nil {
		event.Error = mutationErr.Error()
	}
	if err := j.appendTransaction(event); err != nil {
		return fmt.Errorf("résultat de %s incertain ; vérifier les fichiers avant toute reprise (opération : %v) : journal transactionnel : %w", action, mutationErr, err)
	}
	return mutationErr
}
