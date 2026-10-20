package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"sort"
	"strings"
)

type UndoReport struct {
	Eligible        bool     `json:"eligible"`
	Undone          bool     `json:"undone"`
	Reason          string   `json:"reason"`
	Count           int      `json:"count"`
	Paths           []string `json:"paths"`
	Mode            string   `json:"mode,omitempty"`
	Targets         []string `json:"targets,omitempty"`
	Replacements    int      `json:"replacements,omitempty"`
	Directories     int      `json:"directories,omitempty"`
	Resume          bool     `json:"resume,omitempty"`
	Completed       int      `json:"completed,omitempty"`
	Reconciled      int      `json:"reconciled,omitempty"`
	reconciliations []transactionEvent
}

var transactionID = regexp.MustCompile(`^job-[a-zA-Z0-9-]+$`)

func (h *Host) transactionDir(id string) (string, error) {
	if h.journalDir == "" || !transactionID.MatchString(id) {
		return "", fmt.Errorf("registre de transfert indisponible")
	}
	return filepath.Join(h.journalDir, "transactions", id), nil
}

func readTransactionEvent(dir, name string) (transactionEvent, error) {
	var event transactionEvent
	p := filepath.Join(dir, name)
	info, err := os.Lstat(p)
	if err != nil {
		return event, err
	}
	if !info.Mode().IsRegular() || info.Size() > 65536 {
		return event, fmt.Errorf("entrée de registre invalide")
	}
	data, err := os.ReadFile(p)
	if err != nil {
		return event, err
	}
	if err = json.Unmarshal(data, &event); err != nil {
		return event, err
	}
	if event.Version != 1 {
		return event, fmt.Errorf("version de registre non prise en charge")
	}
	return event, nil
}

// Group created directory trees into a single recoverable trash entry. Existing
// merge directories are never removed. Refuse incomplete evidence.
func (h *Host) undoPlan(id string) (UndoReport, []undoUnit) {
	return h.buildUndoPlan(id, false)
}

func (h *Host) buildUndoPlan(id string, recovering bool) (UndoReport, []undoUnit) {
	report := UndoReport{Paths: []string{}}
	refuse := func(reason string) (UndoReport, []undoUnit) { report.Reason = reason; return report, nil }
	dir, err := h.transactionDir(id)
	if err != nil {
		return refuse(err.Error())
	}
	if info, err := os.Lstat(dir); err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return refuse("Registre absent ou invalide : annulation indisponible.")
	}
	if _, err := os.Lstat(filepath.Join(dir, "undo")); !recovering && err == nil {
		end, e := readTransactionEvent(filepath.Join(dir, "undo"), "00000000-end.json")
		if e == nil && end.Action == "undo" && end.Phase == "end" && end.Error == "" {
			report.Undone = true
			return refuse("Cette opération a déjà été annulée.")
		}
		return refuse("Annulation déjà commencée ou interrompue : vérifiez les fichiers et la corbeille avant toute autre action.")
	} else if !recovering && !os.IsNotExist(err) {
		return refuse("Impossible de lire le registre d'annulation.")
	}
	begin, err := readTransactionEvent(dir, "00000000-begin.json")
	if err != nil || begin.Phase != "begin" || begin.Step != 0 || begin.Action != "transfer" || begin.Error != "" {
		return refuse("Début du transfert absent ou invalide.")
	}
	end, err := readTransactionEvent(dir, "00000000-end.json")
	if err != nil || end.Phase != "end" || end.Step != 0 || end.Action != "transfer" || end.Error != "" {
		return refuse("Transfert incomplet ou en erreur : vérification manuelle nécessaire.")
	}
	a, b := begin, end
	a.Phase = ""
	b.Phase = ""
	a.Time = ""
	b.Time = ""
	if !reflect.DeepEqual(a, b) {
		return refuse("Registre incohérent.")
	}
	if begin.Mode != "copy" && begin.Mode != "move" {
		return refuse("Mode de transfert inconnu.")
	}
	report.Mode = begin.Mode
	rows, err := os.ReadDir(dir)
	if recovering && err == nil {
		filtered := rows[:0]
		for _, row := range rows {
			if row.Name() != "undo" {
				filtered = append(filtered, row)
			}
		}
		rows = filtered
	}
	if err != nil || len(rows) > 20002 || len(rows) < 2 || len(rows)%2 != 0 {
		return refuse("Registre incomplet ou trop volumineux pour cette annulation.")
	}
	var bytes int64
	for _, row := range rows {
		info, err := row.Info()
		if err != nil || !info.Mode().IsRegular() {
			return refuse("Entrée de registre invalide.")
		}
		bytes += info.Size()
		if bytes > 16*1024*1024 {
			return refuse("Registre trop volumineux pour cette annulation.")
		}
	}
	var plan []transactionEvent
	removed := map[string]transactionEvent{}
	backups := map[string]transactionEvent{}
	seen := map[string]bool{}
	for step := 1; step <= (len(rows)-2)/2; step++ {
		intent, e1 := readTransactionEvent(dir, fmt.Sprintf("%08d-intent.json", step))
		result, e2 := readTransactionEvent(dir, fmt.Sprintf("%08d-result.json", step))
		if e1 != nil || e2 != nil || intent.Step != step || result.Step != step || intent.Phase != "intent" || result.Phase != "result" || intent.Error != "" || result.Error != "" {
			return refuse("Une modification a un résultat absent, invalide ou incertain.")
		}
		a, b := intent, result
		a.Phase = ""
		b.Phase = ""
		a.Time = ""
		b.Time = ""
		if !reflect.DeepEqual(a, b) {
			return refuse("Intention et résultat ne correspondent pas.")
		}
		if begin.Mode == "move" && (result.Action == "remove-source" || result.Action == "remove-directory") {
			key := undoPathKey(result.Source)
			if _, ok := removed[key]; ok {
				return refuse("Suppression source répétée dans le registre.")
			}
			removed[key] = result
			continue
		}
		if result.Action == "trash-destination" {
			key := undoPathKey(result.Source)
			if _, ok := backups[key]; ok {
				return refuse("Sauvegarde répétée dans le registre.")
			}
			backups[key] = result
			continue
		}
		if result.Action != "publish-file" && result.Action != "create-directory" {
			return refuse("Modification non prise en charge dans le registre.")
		}
		key := strings.ToLower(filepath.Clean(result.Destination))
		if seen[key] {
			return refuse("Destination répétée dans le registre.")
		}
		seen[key] = true
		plan = append(plan, result)
	}
	if len(plan) == 0 && len(removed) == 0 {
		return refuse("Aucun élément transféré à annuler.")
	}
	if begin.Mode == "move" {
		if err := validateMoveEvidence(plan, removed); err != nil {
			return refuse(err.Error())
		}
	}
	units, err := groupUndoCopies(plan)
	if err != nil {
		return refuse(err.Error())
	}
	recreate := map[string]bool{}
	if len(removed) > 0 {
		if !begin.Merge {
			return refuse("Suppressions de dossiers sans fusion correspondante.")
		}
		for key, event := range removed {
			if event.Action != "remove-directory" || event.Destination != "" || !filepath.IsAbs(event.Source) || filepath.Dir(event.Source) == event.Source {
				return refuse("Suppression de dossier incohérente.")
			}
			for _, unit := range units {
				if isWithin(event.Source, unit.Root.Source) {
					return refuse("Dossier source imbriqué dans un arbre déjà déplacé.")
				}
			}
			recreate[key] = true
		}
	}
	for i := range units {
		units[i].Move = begin.Mode == "move"
		units[i].Recreate = recreate
		if backup, ok := backups[undoPathKey(units[i].Root.Destination)]; ok {
			if begin.Conflict != "overwrite" || units[i].Root.Action != "publish-file" || backup.Step >= units[i].Root.Step {
				return refuse("Sauvegarde de remplacement incohérente.")
			}
			units[i].Backup = &backup
			if !recovering {
				if err := checkUndoBackup(backup); err != nil {
					return refuse(err.Error())
				}
			}
			delete(backups, undoPathKey(units[i].Root.Destination))
			report.Replacements++
		}
		unit := units[i]
		if recovering {
			continue
		}
		if unit.Move {
			if err := checkMoveTarget(unit); err != nil {
				return refuse(err.Error())
			}
		}
		if err := checkUndoUnit(unit, unit.Root.Destination); err != nil {
			return refuse(err.Error())
		}
	}
	if len(backups) != 0 {
		return refuse("Sauvegarde sans remplacement correspondant.")
	}
	// Reverse execution creates missing merge directories before returning files.
	directories := []string{}
	for _, event := range removed {
		if _, err := os.Lstat(event.Source); !recovering && !os.IsNotExist(err) {
			return refuse("Dossier source réapparu ou inaccessible : " + event.Source)
		}
		if err := checkUndoParent(filepath.Dir(event.Source), recreate); !recovering && err != nil {
			return refuse(err.Error())
		}
		directories = append(directories, event.Source)
	}
	sort.Slice(directories, func(i, j int) bool {
		if len(directories[i]) == len(directories[j]) {
			return directories[i] < directories[j]
		}
		return len(directories[i]) > len(directories[j])
	})
	for _, path := range directories {
		units = append(units, undoUnit{Root: transactionEvent{Action: "restore-directory", Source: path, Destination: path}})
	}
	report.Directories = len(directories)
	report.Eligible = true
	report.Count = len(units)
	for _, unit := range units {
		if len(report.Paths) < 10 {
			report.Paths = append(report.Paths, unit.Root.Destination)
			if unit.Move {
				report.Targets = append(report.Targets, unit.Root.Source)
			}
		}
	}
	return report, units
}

func checkedCopyFile(path, hash string) (os.FileInfo, error) {
	if len(hash) != 64 || !filepath.IsAbs(path) {
		return nil, fmt.Errorf("chemin ou empreinte de registre invalide")
	}
	canonical, err := filepath.EvalSymlinks(path)
	if err != nil || !strings.EqualFold(filepath.Clean(canonical), filepath.Clean(path)) {
		return nil, fmt.Errorf("fichier absent ou chemin lié : %s", path)
	}
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() {
		return nil, fmt.Errorf("fichier ordinaire requis : %s", path)
	}
	actual, err := hashFile(path, "blake3")
	if err != nil || actual != hash {
		return nil, fmt.Errorf("contenu modifié ou illisible : %s", path)
	}
	after, err := os.Lstat(path)
	if err != nil || !os.SameFile(info, after) || info.Size() != after.Size() || !info.ModTime().Equal(after.ModTime()) {
		return nil, fmt.Errorf("fichier modifié pendant la vérification : %s", path)
	}
	return after, nil
}

func checkUndoCopy(event transactionEvent) error {
	src, err := checkedCopyFile(event.Source, event.Hash)
	if err != nil {
		return err
	}
	dst, err := checkedCopyFile(event.Destination, event.Hash)
	if err != nil {
		return err
	}
	if os.SameFile(src, dst) {
		return fmt.Errorf("source et copie désignent le même fichier")
	}
	return nil
}

func (h *Host) undoCopy(id string) (any, error) {
	unlock, err := h.lockUndo(id)
	if err != nil {
		return nil, err
	}
	defer unlock()
	report, plan := h.undoPlan(id)
	if !report.Eligible {
		return nil, fmt.Errorf("%s", report.Reason)
	}
	dir, _ := h.transactionDir(id)
	undoDir := filepath.Join(dir, "undo")
	// Exclusive claim survives restart and prevents a second host from replaying it.
	if err := os.Mkdir(undoDir, 0700); err != nil {
		return nil, err
	}
	if err := writeTransactionEvent(undoDir, transactionEvent{Action: "undo", Phase: "begin"}); err != nil {
		return nil, err
	}
	return h.executeUndoPlan(report, plan, undoDir, 0)
}

func (h *Host) executeUndoPlan(report UndoReport, plan []undoUnit, undoDir string, completed int) (any, error) {
	for i := len(plan) - 1 - completed; i >= 0; i-- {
		unit := plan[i]
		event := unit.Root
		step := 2*(len(plan)-i) - 1
		if event.Action == "restore-directory" {
			if err := undoMergeDirectory(event.Source, undoDir, step); err != nil {
				return nil, fmt.Errorf("annulation partielle : %w", err)
			}
			continue
		}
		unit.Recreate = nil
		if unit.Backup != nil {
			if err := checkUndoBackup(*unit.Backup); err != nil {
				return nil, err
			}
		}
		if unit.Move {
			if err := undoMoveUnit(unit, undoDir, step); err != nil {
				return nil, fmt.Errorf("annulation arrêtée, éventuellement partielle ; vérifier les emplacements indiqués : %w", err)
			}
			h.send(M{"event": "PATH_RELOCATED", "data": M{"from": unit.Root.Destination, "to": unit.Root.Source}})
			if unit.Backup != nil {
				if err := restoreUndoBackup(*unit.Backup, undoDir, step+1); err != nil {
					return nil, err
				}
			}
			continue
		}
		_, err := trashFilesRecorded([]string{event.Destination}, func(original, stored, record string, mutate func() error) error {
			if err := checkUndoUnit(unit, event.Destination); err != nil {
				return err
			}
			entry := transactionEvent{Step: step, Phase: "intent", Action: "undo-copy", Source: original, Destination: stored, Hash: event.Hash, TrashRecord: record}
			if err := writeTransactionEvent(undoDir, entry); err != nil {
				return err
			}
			mutationErr := mutate()
			if mutationErr == nil {
				// An external writer may race the last check. Preserve its changes
				// and attempt restoration; never silently discard a changed file.
				if err := checkUndoUnit(unit, stored); err != nil {
					_, restoreErr := restoreTrash(record)
					mutationErr = fmt.Errorf("copie modifiée pendant l'annulation ; restauration : %v ; %w", restoreErr, err)
				}
			}
			entry.Phase = "result"
			if mutationErr != nil {
				entry.Error = mutationErr.Error()
			}
			if err := writeTransactionEvent(undoDir, entry); err != nil {
				return fmt.Errorf("résultat d'annulation incertain : %w", err)
			}
			return mutationErr
		})
		if err != nil {
			return nil, fmt.Errorf("annulation arrêtée, éventuellement partielle ; vérifier la corbeille : %w", err)
		}
		if unit.Backup != nil {
			if err := restoreUndoBackup(*unit.Backup, undoDir, step+1); err != nil {
				return nil, err
			}
		}
	}
	if err := writeTransactionEvent(undoDir, transactionEvent{Action: "undo", Phase: "end"}); err != nil {
		return nil, err
	}
	return M{"count": len(plan) - completed, "replacements": report.Replacements}, nil
}
