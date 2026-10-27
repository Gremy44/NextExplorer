//go:build windows

package main

import (
	"encoding/base64"
	"fmt"
	"golang.org/x/sys/windows"
	"unsafe"
)

func protectRemoteSecret(value string) (string, error) {
	if value == "" {
		return "", nil
	}
	data := []byte(value)
	input := windows.DataBlob{Size: uint32(len(data)), Data: &data[0]}
	var output windows.DataBlob
	if err := windows.CryptProtectData(&input, nil, nil, 0, nil, windows.CRYPTPROTECT_UI_FORBIDDEN, &output); err != nil {
		return "", fmt.Errorf("protection Windows du secret impossible")
	}
	defer windows.LocalFree(windows.Handle(unsafe.Pointer(output.Data)))
	return base64.StdEncoding.EncodeToString(unsafe.Slice(output.Data, output.Size)), nil
}
func unprotectRemoteSecret(value string) (string, error) {
	if value == "" {
		return "", nil
	}
	data, err := base64.StdEncoding.DecodeString(value)
	if err != nil || len(data) == 0 {
		return "", fmt.Errorf("secret protégé illisible")
	}
	input := windows.DataBlob{Size: uint32(len(data)), Data: &data[0]}
	var output windows.DataBlob
	if err = windows.CryptUnprotectData(&input, nil, nil, 0, nil, windows.CRYPTPROTECT_UI_FORBIDDEN, &output); err != nil {
		return "", fmt.Errorf("secret Windows indisponible pour ce compte ; saisissez-le de nouveau")
	}
	defer windows.LocalFree(windows.Handle(unsafe.Pointer(output.Data)))
	return string(unsafe.Slice(output.Data, output.Size)), nil
}
