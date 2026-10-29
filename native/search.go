package main

import "fmt"

// Return only a boolean so large metadata checks never exceed native messaging frames.
func checkEntries(entries []Entry) (any, error) {
	if len(entries) == 0 || len(entries) > 100 {
		return nil, fmt.Errorf("Contrôle limité à 100 références")
	}
	for _, expected := range entries {
		actual, err := statEntry(expected.Path)
		if err != nil || actual.Type != expected.Type || actual.Size != expected.Size || actual.Mtime != expected.Mtime || (expected.Stamp != "" && actual.Stamp != expected.Stamp) {
			return M{"current": false}, nil
		}
	}
	return M{"current": true}, nil
}
