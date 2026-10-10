package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Only existing regular files are offered; drag never mutates a source.
func dragPaths(paths []string) ([]string, error) {
	if len(paths) == 0 || len(paths) > 100 {
		return nil, fmt.Errorf("Sélectionnez entre 1 et 100 fichiers")
	}
	result := make([]string, 0, len(paths))
	seen := map[string]bool{}
	for _, path := range paths {
		clean, err := validPath(path)
		if err != nil {
			return nil, err
		}
		clean, err = filepath.EvalSymlinks(clean)
		if err != nil {
			return nil, err
		}
		clean, err = validPath(clean)
		if err != nil {
			return nil, err
		}
		info, err := os.Stat(clean)
		if err != nil {
			return nil, err
		}
		if !info.Mode().IsRegular() {
			return nil, fmt.Errorf("Le glissement accepte uniquement des fichiers ordinaires")
		}
		key := strings.ToLower(clean)
		if !seen[key] {
			result = append(result, clean)
			seen[key] = true
		}
	}
	return result, nil
}
