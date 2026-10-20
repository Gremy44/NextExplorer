//go:build !windows

package main

import "fmt"

func consoleSupported() bool { return false }
func consoleBuild() uint32   { return 0 }
func startConsole(path, marker string, cols, rows int) (terminalProcess, error) {
	return nil, fmt.Errorf("console intégrée disponible sous Windows uniquement")
}
func consoleDirectory(path string) (string, error) { return validPath(path) }
