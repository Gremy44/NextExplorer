//go:build !windows

package main

import (
	"fmt"
	"os"
)

func openEditorExclusive(path string) (*os.File, error) {
	return nil, fmt.Errorf("Écriture protégée disponible sous Windows uniquement")
}
