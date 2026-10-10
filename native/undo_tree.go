package main

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

type undoUnit struct {
	Root     transactionEvent
	Entries  []transactionEvent
	Move     bool
	Backup   *transactionEvent
	Recreate map[string]bool
}

func undoPathKey(path string) string { return strings.ToLower(filepath.Clean(path)) }

func groupUndoCopies(events []transactionEvent) ([]undoUnit, error) {
	byPath := map[string]transactionEvent{}
	for _, e := range events {
		if !filepath.IsAbs(e.Source) || !filepath.IsAbs(e.Destination) || filepath.Dir(e.Destination) == e.Destination {
			return nil, fmt.Errorf("chemin de copie invalide")
		}
		key := undoPathKey(e.Destination)
		if _, ok := byPath[key]; ok {
			return nil, fmt.Errorf("destination répétée")
		}
		byPath[key] = e
	}
	units := []undoUnit{}
	owners := map[string]int{}
	for _, e := range events {
		root := e
		for parent := filepath.Dir(e.Destination); ; parent = filepath.Dir(parent) {
			if ancestor, ok := byPath[undoPathKey(parent)]; ok {
				if ancestor.Action != "create-directory" {
					return nil, fmt.Errorf("arborescence incohérente dans le registre")
				}
				root = ancestor
			}
			if filepath.Dir(parent) == parent {
				break
			}
		}
		key := undoPathKey(root.Destination)
		index, ok := owners[key]
		if !ok {
			index = len(units)
			owners[key] = index
			units = append(units, undoUnit{Root: root})
		}
		units[index].Entries = append(units[index].Entries, e)
	}
	return units, nil
}

func checkedCopyDirectory(path string) (os.FileInfo, error) {
	if !filepath.IsAbs(path) {
		return nil, fmt.Errorf("chemin de dossier invalide")
	}
	canonical, err := filepath.EvalSymlinks(path)
	if err != nil || !strings.EqualFold(filepath.Clean(canonical), filepath.Clean(path)) {
		return nil, fmt.Errorf("dossier absent ou chemin lié : %s", path)
	}
	info, err := os.Lstat(path)
	if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return nil, fmt.Errorf("dossier ordinaire requis : %s", path)
	}
	return info, nil
}

// destination may be the original target or its location in the trash. Check
// every recorded entry and reject any unrecorded file/directory, including empty
// directories and nested trash folders. Never walk links.
func checkUndoUnit(unit undoUnit, destination string) error {
	if unit.Root.Action == "publish-file" {
		e := unit.Root
		e.Destination = destination
		if unit.Move {
			_, err := checkedCopyFile(destination, e.Hash)
			return err
		}
		return checkUndoCopy(e)
	}
	expected := map[string]transactionEvent{}
	for _, event := range unit.Entries {
		rel, err := filepath.Rel(unit.Root.Destination, event.Destination)
		if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			return fmt.Errorf("entrée hors du dossier copié")
		}
		expected[undoPathKey(rel)] = event
	}
	visited := 0
	err := filepath.WalkDir(destination, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		rel, err := filepath.Rel(destination, path)
		if err != nil {
			return err
		}
		event, ok := expected[undoPathKey(rel)]
		if !ok {
			return fmt.Errorf("élément ajouté depuis la copie : %s", path)
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return fmt.Errorf("lien refusé : %s", path)
		}
		visited++
		if event.Action == "create-directory" {
			if unit.Move {
				_, err := checkedCopyDirectory(path)
				return err
			}
			src, err := checkedCopyDirectory(event.Source)
			if err != nil {
				return err
			}
			dst, err := checkedCopyDirectory(path)
			if err != nil {
				return err
			}
			if os.SameFile(src, dst) {
				return fmt.Errorf("source et copie désignent le même dossier")
			}
			return nil
		}
		event.Destination = path
		if unit.Move {
			_, err := checkedCopyFile(path, event.Hash)
			return err
		}
		return checkUndoCopy(event)
	})
	if err != nil {
		return err
	}
	if visited != len(expected) {
		return fmt.Errorf("élément manquant dans le dossier copié")
	}
	return nil
}
