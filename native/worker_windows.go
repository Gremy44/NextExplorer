package main

import (
	"crypto/sha256"
	"fmt"
	"os"
	"os/exec"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

func workerPipe() (string, *windows.SECURITY_DESCRIPTOR, error) {
	user, err := windows.GetCurrentProcessToken().GetTokenUser()
	if err != nil {
		return "", nil, err
	}
	dir, err := workerDirectory()
	if err != nil {
		return "", nil, err
	}
	sid := user.User.Sid.String()
	sd, err := windows.SecurityDescriptorFromString("D:P(A;;GA;;;SY)(A;;GA;;;" + sid + ")")
	return fmt.Sprintf(`\\.\pipe\NextExplorer-%s-%x`, sid, sha256.Sum256([]byte(dir))), sd, err
}
func dialWorker() (*os.File, error) {
	name, _, err := workerPipe()
	if err != nil {
		return nil, err
	}
	ptr, err := windows.UTF16PtrFromString(name)
	if err != nil {
		return nil, err
	}
	open := func() (*os.File, error) {
		h, e := windows.CreateFile(ptr, windows.GENERIC_READ|windows.GENERIC_WRITE, 0, nil, windows.OPEN_EXISTING, windows.FILE_FLAG_OVERLAPPED, 0)
		if e != nil {
			return nil, e
		}
		return os.NewFile(uintptr(h), name), nil
	}
	if f, e := open(); e == nil {
		return f, nil
	}
	exe, err := os.Executable()
	if err != nil {
		return nil, err
	}
	c := exec.Command(exe, "--worker")
	// Break out of the browser job so closing Chrome does not kill local tasks.
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: windows.CREATE_BREAKAWAY_FROM_JOB | windows.DETACHED_PROCESS}
	if err = c.Start(); err != nil {
		return nil, fmt.Errorf("démarrage autonome refusé : %w", err)
	}
	c.Process.Release()
	deadline := time.Now().Add(8 * time.Second)
	for time.Now().Before(deadline) {
		if f, e := open(); e == nil {
			return f, nil
		}
		time.Sleep(40 * time.Millisecond)
	}
	return nil, fmt.Errorf("worker local non joignable")
}
func acceptWorker(accepted func(*os.File)) error {
	name, sd, err := workerPipe()
	if err != nil {
		return err
	}
	ptr, err := windows.UTF16PtrFromString(name)
	if err != nil {
		return err
	}
	sa := &windows.SecurityAttributes{Length: uint32(unsafe.Sizeof(windows.SecurityAttributes{})), SecurityDescriptor: sd}
	flags := uint32(windows.PIPE_ACCESS_DUPLEX | windows.FILE_FLAG_OVERLAPPED | windows.FILE_FLAG_FIRST_PIPE_INSTANCE)
	for {
		h, err := windows.CreateNamedPipe(ptr, flags, windows.PIPE_TYPE_BYTE|windows.PIPE_READMODE_BYTE|windows.PIPE_WAIT|windows.PIPE_REJECT_REMOTE_CLIENTS, 16, 65536, 65536, 0, sa)
		if err != nil {
			return err
		}
		flags &^= windows.FILE_FLAG_FIRST_PIPE_INSTANCE
		event, err := windows.CreateEvent(nil, 1, 0, nil)
		if err != nil {
			windows.CloseHandle(h)
			return err
		}
		o := &windows.Overlapped{HEvent: event}
		err = windows.ConnectNamedPipe(h, o)
		if err == windows.ERROR_IO_PENDING {
			_, err = windows.WaitForSingleObject(event, windows.INFINITE)
			if err == nil {
				var bytes uint32
				err = windows.GetOverlappedResult(h, o, &bytes, false)
			}
		}
		windows.CloseHandle(event)
		if err != nil && err != windows.ERROR_PIPE_CONNECTED {
			windows.CloseHandle(h)
			return err
		}
		accepted(os.NewFile(uintptr(h), name))
	}
}
