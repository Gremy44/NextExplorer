//go:build !windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func diskVolumes() ([]M, error) {
	volumes := hello()["roots"].([]M)
	for _, volume := range volumes {
		volume["kind"], volume["error"] = "local", "Capacité indisponible"
	}
	return volumes, nil
}

func moveUndoEntry(src, dst string) error {
	return fmt.Errorf("annulation du déplacement réservée à Windows")
}

func crossVolumeMove(err error) bool { return false }

func lockUndoFile(path string) (func(), error) { return func() {}, nil }

func hidden(path, name string) bool     { return strings.HasPrefix(name, ".") }
func quiet(c *exec.Cmd)                 {}
func runImageCommand(c *exec.Cmd) error { return c.Run() }
func publishFile(src, dst string) error {
	if e := os.Link(src, dst); e != nil {
		return e
	}
	return os.Remove(src)
}
func homeAliases(home string) M {
	return M{"~": home, "~dl": filepath.Join(home, "Downloads"), "~desk": filepath.Join(home, "Desktop"), "~docs": filepath.Join(home, "Documents")}
}
