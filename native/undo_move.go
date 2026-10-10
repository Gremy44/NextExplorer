package main

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"time"
)

func validateMoveEvidence(plan []transactionEvent, removed map[string]transactionEvent) error {
	if len(plan) > len(removed) {
		return fmt.Errorf("registre du déplacement incomplet")
	}
	for _, event := range plan {
		key := undoPathKey(event.Source)
		removal, ok := removed[key]
		if !ok || removal.Step <= event.Step {
			return fmt.Errorf("suppression source non confirmée")
		}
		if event.Action == "publish-file" {
			if removal.Action != "remove-source" || removal.Destination != event.Destination || removal.Hash != event.Hash {
				return fmt.Errorf("suppression source incohérente")
			}
		} else if removal.Action != "remove-directory" || removal.Destination != "" {
			return fmt.Errorf("suppression du dossier incohérente")
		}
		delete(removed, key)
	}
	return nil
}

func checkMoveTarget(unit undoUnit) error {
	if runtime.GOOS != "windows" {
		return fmt.Errorf("annulation du déplacement réservée à Windows")
	}
	if _, err := os.Lstat(unit.Root.Source); !os.IsNotExist(err) {
		return fmt.Errorf("emplacement d'origine occupé ou inaccessible : %s", unit.Root.Source)
	}
	if err := checkUndoParent(filepath.Dir(unit.Root.Source), unit.Recreate); err != nil {
		return err
	}
	for _, event := range unit.Entries {
		rel, err := filepath.Rel(unit.Root.Destination, event.Destination)
		if err != nil || undoPathKey(filepath.Join(unit.Root.Source, rel)) != undoPathKey(event.Source) {
			return fmt.Errorf("arborescence source incohérente")
		}
	}
	return nil
}

func checkUndoParent(path string, recreate map[string]bool) error {
	for recreate[undoPathKey(path)] {
		if _, err := os.Lstat(path); !os.IsNotExist(err) {
			return fmt.Errorf("dossier source réapparu ou inaccessible : %s", path)
		}
		path = filepath.Dir(path)
	}
	_, err := checkedCopyDirectory(path)
	return err
}

func undoMergeDirectory(path, dir string, step int) error {
	if err := checkUndoParent(filepath.Dir(path), nil); err != nil {
		return err
	}
	event := transactionEvent{Step: step, Phase: "intent", Action: "undo-create-directory", Destination: path}
	if err := writeTransactionEvent(dir, event); err != nil {
		return err
	}
	// ponytail: original ACL/timestamps are not journaled; persist them before
	// supporting exact metadata restoration. New folders inherit parent permissions.
	err := os.Mkdir(path, 0700)
	event.Phase = "result"
	if err != nil {
		event.Error = err.Error()
	}
	if journalErr := writeTransactionEvent(dir, event); journalErr != nil {
		return fmt.Errorf("création du dossier non confirmée : %w", journalErr)
	}
	return err
}

func undoMoveUnit(unit undoUnit, dir string, step int) error {
	if err := checkMoveTarget(unit); err != nil {
		return err
	}
	if err := checkUndoUnit(unit, unit.Root.Destination); err != nil {
		return err
	}
	event := transactionEvent{Step: step, Phase: "intent", Action: "undo-move", Source: unit.Root.Destination, Destination: unit.Root.Source, Hash: unit.Root.Hash}
	if err := writeTransactionEvent(dir, event); err != nil {
		return err
	}
	err := moveUndoEntry(event.Source, event.Destination)
	if crossVolumeMove(err) {
		err = copyUndoMove(unit, dir, step)
	} else if err == nil {
		if checkErr := checkUndoUnit(unit, event.Destination); checkErr != nil {
			rollbackErr := moveUndoEntry(event.Destination, event.Source)
			err = fmt.Errorf("contenu modifié pendant l'annulation ; retour à l'emplacement précédent : %v ; %w", rollbackErr, checkErr)
		}
	}
	event.Phase = "result"
	if err != nil {
		event.Error = err.Error()
	}
	if journalErr := writeTransactionEvent(dir, event); journalErr != nil {
		return fmt.Errorf("résultat d'annulation incertain : %w", journalErr)
	}
	return err
}

func copyUndoMove(unit undoUnit, dir string, step int) (failure error) {
	if err := checkMoveTarget(unit); err != nil {
		return err
	}
	if err := checkUndoUnit(unit, unit.Root.Destination); err != nil {
		return err
	}
	// Reuse the verified transfer engine and its per-mutation journal. Internal
	// progress stays off the activity list; this is part of the existing undo.
	host := newHost(io.Discard)
	host.journalDir = dir
	j := &Job{ID: fmt.Sprintf("job-return-%d", step), Kind: "transfer", State: "running", host: host, ctx: context.Background(), started: time.Now()}
	finish, err := j.beginTransaction(Payload{Mode: "copy", Conflict: "rename"})
	if err != nil {
		return err
	}
	defer func() { failure = finish(failure) }()
	if err := j.copyTree(unit.Root.Destination, unit.Root.Source, false, false); err != nil {
		return err
	}
	if err := checkUndoUnit(unit, unit.Root.Source); err != nil {
		return err
	}
	_, err = trashFilesRecorded([]string{unit.Root.Destination}, func(original, stored, record string, mutate func() error) error {
		if err := checkUndoUnit(unit, unit.Root.Source); err != nil {
			return err
		}
		if err := checkUndoUnit(unit, original); err != nil {
			return err
		}
		return j.transaction("undo-retire", original, stored, unit.Root.Hash, record, func() error {
			if err := mutate(); err != nil {
				return err
			}
			if err := checkUndoUnit(unit, stored); err != nil {
				_, restoreErr := restoreTrash(record)
				return fmt.Errorf("version déplacée modifiée ; restauration : %v ; %w", restoreErr, err)
			}
			if err := checkUndoUnit(unit, unit.Root.Source); err != nil {
				_, restoreErr := restoreTrash(record)
				return fmt.Errorf("retour modifié ; restauration de la version déplacée : %v ; %w", restoreErr, err)
			}
			return nil
		})
	})
	return err
}
