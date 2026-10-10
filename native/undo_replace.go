package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

func checkUndoBackup(event transactionEvent) error {
	dir := filepath.Join(filepath.Dir(event.Source), ".nextexplorer-trash")
	if !filepath.IsAbs(event.Source) || filepath.Dir(event.Destination) != dir || filepath.Dir(event.TrashRecord) != dir {
		return fmt.Errorf("sauvegarde de remplacement hors périmètre")
	}
	if _, err := checkedCopyDirectory(dir); err != nil {
		return err
	}
	info, err := os.Lstat(event.TrashRecord)
	if err != nil || !info.Mode().IsRegular() || info.Size() > 65536 {
		return fmt.Errorf("registre de corbeille absent ou invalide")
	}
	data, err := os.ReadFile(event.TrashRecord)
	if err != nil {
		return err
	}
	var record TrashRecord
	if json.Unmarshal(data, &record) != nil || record.Original != event.Source || record.Stored != event.Destination {
		return fmt.Errorf("registre de corbeille différent de la sauvegarde enregistrée")
	}
	if _, err := checkedCopyFile(event.Destination, event.Hash); err != nil {
		return fmt.Errorf("ancien fichier indisponible : %w", err)
	}
	return nil
}

// The new file has already been preserved (in trash for a copy, at its original
// source for a move). A failed restoration therefore leaves both versions safe.
func restoreUndoBackup(backup transactionEvent, dir string, step int) error {
	if err := checkUndoBackup(backup); err != nil {
		return fmt.Errorf("annulation partielle, ancien fichier non restauré : %w", err)
	}
	if _, err := os.Lstat(backup.Source); !os.IsNotExist(err) {
		return fmt.Errorf("annulation partielle : emplacement à restaurer occupé ou inaccessible : %s", backup.Source)
	}
	event := transactionEvent{Step: step, Phase: "intent", Action: "undo-restore", Source: backup.Destination, Destination: backup.Source, Hash: backup.Hash, TrashRecord: backup.TrashRecord}
	if err := writeTransactionEvent(dir, event); err != nil {
		return err
	}
	err := publishFile(event.Source, event.Destination)
	if err == nil {
		if _, checkErr := checkedCopyFile(event.Destination, event.Hash); checkErr != nil {
			rollbackErr := publishFile(event.Destination, event.Source)
			err = fmt.Errorf("sauvegarde modifiée pendant la restauration ; retour en corbeille : %v ; %w", rollbackErr, checkErr)
		} else {
			err = os.Remove(backup.TrashRecord)
		}
	}
	event.Phase = "result"
	if err != nil {
		event.Error = err.Error()
	}
	if journalErr := writeTransactionEvent(dir, event); journalErr != nil {
		return fmt.Errorf("résultat de restauration incertain : %w", journalErr)
	}
	if err != nil {
		return fmt.Errorf("annulation partielle ; vérifier les fichiers et la corbeille : %w", err)
	}
	return nil
}
