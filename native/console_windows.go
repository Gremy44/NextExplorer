package main

import (
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"unicode/utf16"
	"unsafe"

	"golang.org/x/sys/windows"
)

type consoleProcess struct {
	input, output *os.File
	pty, job      windows.Handle
	mu            sync.Mutex
	closed        bool
}

func consoleSupported() bool {
	return windows.NewLazySystemDLL("kernel32.dll").NewProc("CreatePseudoConsole").Find() == nil
}
func consoleBuild() uint32 { return windows.RtlGetVersion().BuildNumber }

func startConsole(path, marker string, cols, rows int) (_ terminalProcess, err error) {
	inRead, inWrite, err := os.Pipe()
	if err != nil {
		return nil, err
	}
	defer inRead.Close()
	outRead, outWrite, err := os.Pipe()
	if err != nil {
		inWrite.Close()
		return nil, err
	}
	defer outWrite.Close()
	p := &consoleProcess{input: inWrite, output: outRead}
	defer func() {
		if err != nil {
			p.Close()
		}
	}()
	if err = windows.CreatePseudoConsole(windows.Coord{X: int16(cols), Y: int16(rows)}, windows.Handle(inRead.Fd()), windows.Handle(outWrite.Fd()), 0, &p.pty); err != nil {
		return nil, err
	}
	attributes, err := windows.NewProcThreadAttributeList(1)
	if err != nil {
		return nil, err
	}
	defer attributes.Delete()
	if err = attributes.Update(windows.PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE, unsafe.Pointer(p.pty), unsafe.Sizeof(p.pty)); err != nil {
		return nil, err
	}
	p.job, err = windows.CreateJobObject(nil, nil)
	if err != nil {
		return nil, err
	}
	var limits windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION
	limits.BasicLimitInformation.LimitFlags = windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
	if _, err = windows.SetInformationJobObject(p.job, windows.JobObjectExtendedLimitInformation, uintptr(unsafe.Pointer(&limits)), uint32(unsafe.Sizeof(limits))); err != nil {
		return nil, err
	}
	system, err := windows.GetSystemDirectory()
	if err != nil {
		return nil, err
	}
	shell := filepath.Join(system, "WindowsPowerShell", "v1.0", "powershell.exe")
	// An opaque prompt marker reports readiness and the real shell directory, never commands.
	script := `Set-Location -LiteralPath '` + strings.ReplaceAll(path, "'", "''") + `'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding
$env:TERM = 'xterm-256color'
Import-Module PSReadLine -ErrorAction SilentlyContinue
if (Get-Command Set-PSReadLineOption -ErrorAction SilentlyContinue) {
  Set-PSReadLineOption -HistorySaveStyle SaveNothing
  if ((Get-Command Set-PSReadLineOption).Parameters.ContainsKey('AddToHistoryHandler')) {
    Set-PSReadLineOption -AddToHistoryHandler { param($line) -not $line.StartsWith(' Set-Location -LiteralPath ') }
  }
}
function global:prompt {
  $location = $executionContext.SessionState.Path.CurrentLocation.Path
  [Console]::Write(([char]27).ToString() + ']777;NextExplorer=` + marker + `;' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($location)) + ([char]7))
  'PS ' + $location + '> '
}`
	units := utf16.Encode([]rune(script))
	encoded := make([]byte, len(units)*2)
	for i, unit := range units {
		binary.LittleEndian.PutUint16(encoded[i*2:], unit)
	}
	command, err := windows.UTF16PtrFromString(windows.ComposeCommandLine([]string{shell, "-NoLogo", "-NoProfile", "-NoExit", "-EncodedCommand", base64.StdEncoding.EncodeToString(encoded)}))
	if err != nil {
		return nil, err
	}
	application, _ := windows.UTF16PtrFromString(shell)
	directory, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return nil, err
	}
	// Null standard handles make the child use ConPTY instead of the host's native-messaging pipes.
	si := windows.StartupInfoEx{StartupInfo: windows.StartupInfo{Cb: uint32(unsafe.Sizeof(windows.StartupInfoEx{})), Flags: windows.STARTF_USESHOWWINDOW | windows.STARTF_USESTDHANDLES, ShowWindow: windows.SW_HIDE}, ProcThreadAttributeList: attributes.List()}
	var process windows.ProcessInformation
	if err = windows.CreateProcess(application, command, nil, nil, false, windows.EXTENDED_STARTUPINFO_PRESENT|windows.CREATE_UNICODE_ENVIRONMENT|windows.CREATE_SUSPENDED, nil, directory, &si.StartupInfo, &process); err != nil {
		return nil, err
	}
	defer windows.CloseHandle(process.Thread)
	defer func() {
		if err != nil {
			windows.CloseHandle(process.Process)
		}
	}()
	if err = windows.AssignProcessToJobObject(p.job, process.Process); err != nil {
		windows.TerminateProcess(process.Process, 1)
		return nil, err
	}
	if _, err = windows.ResumeThread(process.Thread); err != nil {
		return nil, err
	}
	go func() {
		windows.WaitForSingleObject(process.Process, windows.INFINITE)
		p.Close()
		windows.CloseHandle(process.Process)
	}()
	return p, nil
}

func (p *consoleProcess) Read(data []byte) (int, error)  { return p.output.Read(data) }
func (p *consoleProcess) Write(data []byte) (int, error) { return p.input.Write(data) }
func (p *consoleProcess) Resize(cols, rows int) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.closed {
		return io.ErrClosedPipe
	}
	return windows.ResizePseudoConsole(p.pty, windows.Coord{X: int16(cols), Y: int16(rows)})
}
func (p *consoleProcess) Close() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.closed {
		return nil
	}
	p.closed = true
	if p.job != 0 {
		windows.TerminateJobObject(p.job, 0)
		windows.CloseHandle(p.job)
	}
	if p.pty != 0 {
		windows.ClosePseudoConsole(p.pty)
	}
	p.input.Close()
	return p.output.Close()
}

func consoleDirectory(path string) (string, error) {
	value, err := validPath(path)
	if err != nil {
		return "", err
	}
	if len(value) > 8192 || strings.ContainsFunc(value, func(r rune) bool { return r < 32 || r == 127 }) {
		return "", fmt.Errorf("chemin du terminal invalide")
	}
	info, err := os.Stat(value)
	if err != nil || !info.IsDir() {
		return "", fmt.Errorf("dossier du terminal inaccessible")
	}
	return value, nil
}
