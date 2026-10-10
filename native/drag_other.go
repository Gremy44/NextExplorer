//go:build !windows

package main

import "fmt"

func nativeDrag(paths []string, stop <-chan struct{}) (M, error) {
	return nil, fmt.Errorf("Le prototype de glissement natif nécessite Windows")
}
