package main

import (
	"errors"
	"fmt"
	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"
)

func diskVolumes() ([]M, error) {
	mask, err := windows.GetLogicalDrives()
	if err != nil {
		return nil, err
	}
	volumes := []M{}
	for letter := 'A'; letter <= 'Z'; letter++ {
		if mask&(1<<uint(letter-'A')) == 0 {
			continue
		}
		root := fmt.Sprintf("%c:\\", letter)
		ptr, _ := windows.UTF16PtrFromString(root)
		kind := windows.GetDriveType(ptr)
		volume := M{"path": root, "name": fmt.Sprintf("Disque %c:", letter), "kind": "local"}
		if kind == windows.DRIVE_REMOTE {
			volume["kind"], volume["error"] = "network", "Capacité réseau non interrogée"
		} else if kind == windows.DRIVE_FIXED || kind == windows.DRIVE_REMOVABLE || kind == windows.DRIVE_RAMDISK {
			var available, total, free uint64
			if err := windows.GetDiskFreeSpaceEx(ptr, &available, &total, &free); err != nil {
				volume["error"] = "Lecteur indisponible"
			} else {
				volume["available"], volume["total"], volume["free"] = available, total, free
			}
			if kind == windows.DRIVE_REMOVABLE {
				volume["kind"] = "removable"
			}
		} else {
			volume["error"] = "Capacité indisponible"
		}
		volumes = append(volumes, volume)
	}
	return volumes, nil
}

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
func runImageCommand(c *exec.Cmd) error {
	job, err := windows.CreateJobObject(nil, nil)
	if err != nil {
		return err
	}
	defer windows.CloseHandle(job)
	var limits windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION
	limits.BasicLimitInformation.LimitFlags = windows.JOB_OBJECT_LIMIT_PROCESS_MEMORY | windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
	limits.ProcessMemoryLimit = 512 << 20
	if _, err = windows.SetInformationJobObject(job, windows.JobObjectExtendedLimitInformation, uintptr(unsafe.Pointer(&limits)), uint32(unsafe.Sizeof(limits))); err != nil {
		return err
	}
	if err = c.Start(); err != nil {
		return err
	}
	process, err := windows.OpenProcess(windows.PROCESS_SET_QUOTA|windows.PROCESS_TERMINATE, false, uint32(c.Process.Pid))
	if err == nil {
		err = windows.AssignProcessToJobObject(job, process)
		windows.CloseHandle(process)
	}
	if err != nil {
		c.Process.Kill()
		c.Wait()
		return err
	}
	return c.Wait()
}
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
