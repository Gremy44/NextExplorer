//go:build !windows

package main

import (
	"fmt"
	"os"
)

func dialWorker() (*os.File, error)     { return nil, fmt.Errorf("worker autonome réservé à Windows") }
func acceptWorker(func(*os.File)) error { return fmt.Errorf("worker autonome réservé à Windows") }
