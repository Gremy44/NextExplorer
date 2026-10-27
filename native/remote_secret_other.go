//go:build !windows

package main

import "fmt"

func protectRemoteSecret(value string) (string, error) {
	if value == "" {
		return "", nil
	}
	return "", fmt.Errorf("mémorisation protégée des secrets disponible sous Windows ; utilisez une session sans mémorisation")
}
func unprotectRemoteSecret(value string) (string, error) {
	if value == "" {
		return "", nil
	}
	return "", fmt.Errorf("secret Windows indisponible sur ce système")
}
