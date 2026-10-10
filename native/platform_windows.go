package main

import (
	"errors"
	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
)

func hidden(path, name string) bool {
	if strings.HasPrefix(name, ".") {
		return true
	}
	p, e := syscall.UTF16PtrFromString(path)
	if e != nil {
		return false
	}
	a, e := syscall.GetFileAttributes(p)
	return e == nil && a&(syscall.FILE_ATTRIBUTE_HIDDEN|syscall.FILE_ATTRIBUTE_SYSTEM) != 0
}
func quiet(c *exec.Cmd) { c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true} }
func publishFile(src, dst string) error {
	a, e := syscall.UTF16PtrFromString(src)
	if e != nil {
		return e
	}
	b, e := syscall.UTF16PtrFromString(dst)
	if e != nil {
		return e
	}
	return syscall.MoveFile(a, b)
}

// Flags 0 forbids replacement and cross-volume copy/delete fallback.
func moveUndoEntry(src, dst string) error {
	a, err := windows.UTF16PtrFromString(src)
	if err != nil {
		return err
	}
	b, err := windows.UTF16PtrFromString(dst)
	if err != nil {
		return err
	}
	return windows.MoveFileEx(a, b, 0)
}

func crossVolumeMove(err error) bool { return errors.Is(err, windows.ERROR_NOT_SAME_DEVICE) }

func lockUndoFile(path string) (func(), error) {
	p, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return nil, err
	}
	h, err := windows.CreateFile(p, windows.GENERIC_READ|windows.GENERIC_WRITE, 0, nil, windows.OPEN_ALWAYS, windows.FILE_ATTRIBUTE_NORMAL, 0)
	if err != nil {
		return nil, err
	}
	return func() { windows.CloseHandle(h) }, nil
}
func homeAliases(home string) M {
	result := M{"~": home, "~dl": filepath.Join(home, "Downloads"), "~desk": filepath.Join(home, "Desktop"), "~docs": filepath.Join(home, "Documents"), "~c": "C:\\"}
	key, e := registry.OpenKey(registry.CURRENT_USER, `Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders`, registry.QUERY_VALUE)
	if e != nil {
		return result
	}
	defer key.Close()
	for alias, name := range map[string]string{"~dl": "{374DE290-123F-4565-9164-39C4925E467B}", "~desk": "Desktop", "~docs": "Personal"} {
		value, _, err := key.GetStringValue(name)
		if err != nil {
			continue
		}
		for _, env := range os.Environ() {
			parts := strings.SplitN(env, "=", 2)
			if len(parts) == 2 {
				value = strings.ReplaceAll(value, "%"+parts[0]+"%", parts[1])
			}
		}
		if filepath.IsAbs(value) {
			result[alias] = value
		}
	}
	return result
}
