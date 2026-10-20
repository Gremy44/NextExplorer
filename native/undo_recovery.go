package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
)

func (h *Host) lockUndo(id string) (func(), error) {
	dir, err := h.transactionDir(id)
	if err != nil {
		return nil, err
	}
	locks := filepath.Join(filepath.Dir(dir), "locks")
	if err := os.MkdirAll(locks, 0700); err != nil {
		return nil, err
	}
	unlock, err := lockUndoFile(filepath.Join(locks, id+".lock"))
	if err != nil {
		return nil, fmt.Errorf("annulation occupée par un autre compagnon ou verrou inaccessible : %w", err)
	}
	return unlock, nil
}

func (h *Host) inspectUndo(id string) UndoReport {
	unlock, err := h.lockUndo(id)
	if err != nil {
		return UndoReport{Reason: err.Error(), Paths: []string{}}
	}
	defer unlock()
	report, _ := h.undoPlan(id)
	if report.Eligible || report.Undone {
		return report
	}
	dir, err := h.transactionDir(id)
	if err != nil {
		return report
	}
	if _, err := os.Lstat(filepath.Join(dir, "undo")); err != nil {
		return report
	}
	report, _ = h.recoverUndoPlan(id)
	return report
}

// ponytail: infer only a verified completed state, never replay an uncertain
// mutation. Partial copies and ambiguous directory ownership require manual repair.
func (h *Host) recoverUndoPlan(id string) (UndoReport, []undoUnit) {
	report, plan := h.buildUndoPlan(id, true)
	if !report.Eligible {
		return report, nil
	}
	refuse := func(reason string) (UndoReport, []undoUnit) {
		report.Eligible = false
		report.Reason = reason
		return report, nil
	}
	if runtime.GOOS != "windows" {
		return refuse("Récupération réservée à Windows.")
	}
	dir, _ := h.transactionDir(id)
	dir = filepath.Join(dir, "undo")
	if _, err := checkedCopyDirectory(dir); err != nil {
		return refuse(err.Error())
	}
	rows, err := os.ReadDir(dir)
	if err != nil || len(rows) > 40003 {
		return refuse("Journal d'annulation illisible ou trop volumineux.")
	}
	events := map[string]transactionEvent{}
	var bytes int64
	for _, row := range rows {
		if row.Name() == "transactions" {
			if _, err := checkedCopyDirectory(filepath.Join(dir, row.Name())); err != nil {
				return refuse(err.Error())
			}
			continue
		}
		info, err := row.Info()
		if err != nil {
			return refuse("Journal d'annulation illisible.")
		}
		bytes += info.Size()
		if bytes > 16*1024*1024 {
			return refuse("Journal d'annulation trop volumineux.")
		}
		event, err := readTransactionEvent(dir, row.Name())
		if err != nil {
			return refuse("Entrée d'annulation invalide : " + row.Name())
		}
		if row.Name() != fmt.Sprintf("%08d-%s.json", event.Step, event.Phase) {
			return refuse("Nom d'entrée d'annulation incohérent.")
		}
		events[row.Name()] = event
	}
	if _, ok := events["00000000-end.json"]; ok {
		return refuse("Fin déjà présente ou invalide : vérification manuelle nécessaire.")
	}
	if len(events) > 0 {
		begin, ok := events["00000000-begin.json"]
		if !ok || begin.Action != "undo" || begin.Phase != "begin" || begin.Step != 0 || begin.Error != "" {
			return refuse("Début d'annulation absent ou invalide.")
		}
		delete(events, "00000000-begin.json")
	}
	completed := 0
	consume := func(intent transactionEvent) error {
		resultName := fmt.Sprintf("%08d-result.json", intent.Step)
		reconciledName := fmt.Sprintf("%08d-reconciled.json", intent.Step)
		_, hasResult := events[resultName]
		_, hasReconciled := events[reconciledName]
		if !hasResult && !hasReconciled {
			if intent.Action == "undo-create-directory" {
				return fmt.Errorf("création de dossier non confirmée : son origine reste incertaine ; vérification manuelle nécessaire")
			}
			// Provisional evidence stays in memory until the ENTIRE plan and
			// current files have passed validation, then explicit confirmation.
			event := intent
			event.Phase = "reconciled"
			events[reconciledName] = event
			report.reconciliations = append(report.reconciliations, event)
		}
		return consumeUndoPair(events, intent)
	}
	for i := len(plan) - 1; i >= 0; i-- {
		unit := plan[i]
		step := 2*(len(plan)-i) - 1
		intent, ok := events[fmt.Sprintf("%08d-intent.json", step)]
		if !ok {
			break
		}
		if err := consume(intent); err != nil {
			return refuse(err.Error())
		}
		action := "undo-copy"
		if unit.Move {
			action = "undo-move"
		}
		if unit.Root.Action == "restore-directory" {
			action = "undo-create-directory"
		}
		if intent.Action != action || intent.Hash != unit.Root.Hash {
			return refuse("Étape différente du plan initial.")
		}
		if action == "undo-create-directory" {
			if intent.Source != "" || intent.Destination != unit.Root.Source {
				return refuse("Chemin de dossier incohérent.")
			}
			if _, err := checkedCopyDirectory(intent.Destination); err != nil {
				return refuse(err.Error())
			}
		} else {
			if intent.Source != unit.Root.Destination {
				return refuse("Source d'annulation incohérente.")
			}
			if unit.Move {
				if intent.Destination != unit.Root.Source {
					return refuse("Destination de retour incohérente.")
				}
			} else if err := checkRecoveredTrash(intent); err != nil {
				return refuse(err.Error())
			}
			if err := checkUndoUnit(unit, intent.Destination); err != nil {
				return refuse(err.Error())
			}
			if unit.Backup != nil {
				restored, ok := events[fmt.Sprintf("%08d-intent.json", step+1)]
				if !ok {
					return refuse("Restauration de l'ancien fichier non confirmée : vérification manuelle nécessaire.")
				}
				if err := consume(restored); err != nil {
					return refuse(err.Error())
				}
				backup := unit.Backup
				if restored.Action != "undo-restore" || restored.Source != backup.Destination || restored.Destination != backup.Source || restored.Hash != backup.Hash || restored.TrashRecord != backup.TrashRecord {
					return refuse("Restauration incohérente.")
				}
				if _, err := checkedCopyFile(backup.Source, backup.Hash); err != nil {
					return refuse(err.Error())
				}
				if _, err := os.Lstat(backup.Destination); !os.IsNotExist(err) {
					return refuse("Sauvegarde encore présente ou inaccessible.")
				}
				if _, err := os.Lstat(backup.TrashRecord); !os.IsNotExist(err) {
					return refuse("Registre de sauvegarde encore présent ou inaccessible : restauration à vérifier manuellement.")
				}
			} else if _, err := os.Lstat(unit.Root.Destination); !os.IsNotExist(err) {
				return refuse("Destination annulée réapparue ou inaccessible.")
			}
		}
		completed++
	}
	if len(events) > 0 {
		return refuse("Étape incomplète, en erreur ou hors ordre : vérification manuelle nécessaire.")
	}
	// Reject an unconfirmed copy-back journal even if its outer intent is lost.
	if subdirs, err := os.ReadDir(filepath.Join(dir, "transactions")); err == nil {
		allowed := map[string]bool{}
		for n := 0; n < completed; n++ {
			if plan[len(plan)-1-n].Move {
				allowed[fmt.Sprintf("job-return-%d", 2*n+1)] = true
			}
		}
		for _, subdir := range subdirs {
			if !allowed[subdir.Name()] {
				return refuse("Copie de retour non confirmée : vérification manuelle nécessaire.")
			}
		}
	} else if !os.IsNotExist(err) {
		return refuse("Journal de copie de retour illisible.")
	}
	recreate := map[string]bool{}
	for i := 0; i < len(plan)-completed; i++ {
		if plan[i].Root.Action == "restore-directory" {
			recreate[undoPathKey(plan[i].Root.Source)] = true
		}
	}
	report.Paths = []string{}
	report.Targets = nil
	report.Replacements = 0
	report.Directories = 0
	for i := len(plan) - 1 - completed; i >= 0; i-- {
		unit := plan[i]
		unit.Recreate = recreate
		if unit.Root.Action == "restore-directory" {
			if _, err := os.Lstat(unit.Root.Source); !os.IsNotExist(err) {
				return refuse("Dossier restant réapparu ou inaccessible.")
			}
			if err := checkUndoParent(filepath.Dir(unit.Root.Source), recreate); err != nil {
				return refuse(err.Error())
			}
			report.Directories++
		} else {
			if unit.Move {
				if err := checkMoveTarget(unit); err != nil {
					return refuse(err.Error())
				}
			}
			if err := checkUndoUnit(unit, unit.Root.Destination); err != nil {
				return refuse(err.Error())
			}
			if unit.Backup != nil {
				if err := checkUndoBackup(*unit.Backup); err != nil {
					return refuse(err.Error())
				}
				report.Replacements++
			}
		}
		if len(report.Paths) < 10 {
			report.Paths = append(report.Paths, unit.Root.Destination)
			target := ""
			if unit.Move {
				target = unit.Root.Source
			}
			report.Targets = append(report.Targets, target)
		}
	}
	report.Resume = true
	report.Completed = completed
	report.Reconciled = len(report.reconciliations)
	report.Count = len(plan) - completed
	report.Reason = "Les étapes terminées sont vérifiées ; seules les étapes restantes seront exécutées."
	return report, plan
}

func consumeUndoPair(events map[string]transactionEvent, intent transactionEvent) error {
	name := fmt.Sprintf("%08d-result.json", intent.Step)
	result, ok := events[name]
	phase := "result"
	if !ok {
		name = fmt.Sprintf("%08d-reconciled.json", intent.Step)
		result, ok = events[name]
		phase = "reconciled"
	}
	if !ok || intent.Phase != "intent" || result.Phase != phase || intent.Error != "" || result.Error != "" {
		return fmt.Errorf("étape sans résultat réussi : vérification manuelle nécessaire")
	}
	a, b := intent, result
	a.Phase = ""
	b.Phase = ""
	a.Time = ""
	b.Time = ""
	if !reflect.DeepEqual(a, b) {
		return fmt.Errorf("intention et résultat d'annulation incohérents")
	}
	delete(events, name)
	delete(events, fmt.Sprintf("%08d-intent.json", intent.Step))
	return nil
}

func checkRecoveredTrash(event transactionEvent) error {
	dir := filepath.Join(filepath.Dir(event.Source), ".nextexplorer-trash")
	if filepath.Dir(event.Destination) != dir || filepath.Dir(event.TrashRecord) != dir {
		return fmt.Errorf("corbeille hors périmètre")
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
		return fmt.Errorf("registre de corbeille incohérent")
	}
	return nil
}

func (h *Host) resumeUndo(id string) (any, error) {
	unlock, err := h.lockUndo(id)
	if err != nil {
		return nil, err
	}
	defer unlock()
	report, plan := h.recoverUndoPlan(id)
	if !report.Eligible || !report.Resume {
		return nil, fmt.Errorf("%s", report.Reason)
	}
	dir, _ := h.transactionDir(id)
	dir = filepath.Join(dir, "undo")
	if _, err := os.Lstat(filepath.Join(dir, "00000000-begin.json")); os.IsNotExist(err) {
		if err := writeTransactionEvent(dir, transactionEvent{Action: "undo", Phase: "begin"}); err != nil {
			return nil, err
		}
	}
	for _, event := range report.reconciliations {
		if err := writeTransactionEvent(dir, event); err != nil {
			return nil, fmt.Errorf("confirmation de récupération non enregistrée : %w", err)
		}
	}
	return h.executeUndoPlan(report, plan, dir, report.Completed)
}
