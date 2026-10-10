package main

import (
	"encoding/binary"
	"fmt"
	"os"
	"runtime"
	"sync"
	"syscall"
	"time"
	"unicode/utf16"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	dragOLE    = windows.NewLazySystemDLL("ole32.dll")
	dragShell  = windows.NewLazySystemDLL("shell32.dll")
	dragKernel = windows.NewLazySystemDLL("kernel32.dll")
	dragUser   = windows.NewLazySystemDLL("user32.dll")
	dragMutex  sync.Mutex
	dataIID    = windows.GUID{Data1: 0x10e, Data4: [8]byte{0xc0, 0, 0, 0, 0, 0, 0, 0x46}}
	sourceIID  = windows.GUID{Data1: 0x121, Data4: [8]byte{0xc0, 0, 0, 0, 0, 0, 0, 0x46}}
	unknownIID = windows.GUID{Data4: [8]byte{0xc0, 0, 0, 0, 0, 0, 0, 0x46}}
)

const dragDrop = 0x40100
const dragCancel = 0x40101

type dragFormat struct {
	Format uint16
	Target uintptr
	Aspect uint32
	Index  int32
	Medium uint32
}
type dragMedium struct {
	Medium  uint32
	Handle  uintptr
	Release uintptr
}
type dropSource struct {
	VTable   *[5]uintptr
	Stop     <-chan struct{}
	Deadline time.Time
}

// Allocate callbacks once: NewCallback allocations cannot be released.
var sourceVTable = [5]uintptr{
	syscall.NewCallback(func(this, iid, out uintptr) uintptr {
		if out == 0 {
			return 0x80004003
		}
		*(*uintptr)(unsafe.Pointer(out)) = 0
		id := *(*windows.GUID)(unsafe.Pointer(iid))
		if id != sourceIID && id != unknownIID {
			return 0x80004002
		}
		*(*uintptr)(unsafe.Pointer(out)) = this
		return 0
	}),
	syscall.NewCallback(func(this uintptr) uintptr { return 2 }),
	syscall.NewCallback(func(this uintptr) uintptr { return 1 }),
	syscall.NewCallback(func(this, escape, keys uintptr) uintptr {
		source := (*dropSource)(unsafe.Pointer(this))
		select {
		case <-source.Stop:
			return dragCancel
		default:
		}
		if escape != 0 || time.Now().After(source.Deadline) {
			return dragCancel
		}
		if keys&1 == 0 {
			return dragDrop
		}
		return 0
	}),
	syscall.NewCallback(func(this, effect uintptr) uintptr { return 0x40102 }), // default Windows cursors
}

func dragHRESULT(operation string, hr uintptr) error {
	if int32(hr) < 0 {
		return fmt.Errorf("%s : erreur Windows 0x%08x", operation, uint32(hr))
	}
	return nil
}

func comCall(object uintptr, method int, args ...uintptr) uintptr {
	table := *(*uintptr)(unsafe.Pointer(object))
	function := *(*uintptr)(unsafe.Pointer(table + uintptr(method)*unsafe.Sizeof(uintptr(0))))
	hr, _, _ := syscall.SyscallN(function, append([]uintptr{object}, args...)...)
	return hr
}

func dragDataObject(paths []string) (uintptr, error) {
	var object uintptr
	hr, _, _ := dragShell.NewProc("SHCreateDataObject").Call(0, 0, 0, 0, uintptr(unsafe.Pointer(&dataIID)), uintptr(unsafe.Pointer(&object)))
	if err := dragHRESULT("Création du transfert", hr); err != nil {
		return 0, err
	}
	// DROPFILES: 20 byte header followed by double-NUL UTF-16 path list.
	names := utf16.Encode([]rune(joinDragPaths(paths)))
	bytes := 20 + len(names)*2
	handle, _, _ := dragKernel.NewProc("GlobalAlloc").Call(0x42, uintptr(bytes))
	if handle == 0 {
		comCall(object, 2)
		return 0, fmt.Errorf("Mémoire du transfert indisponible")
	}
	memory, _, _ := dragKernel.NewProc("GlobalLock").Call(handle)
	if memory == 0 {
		dragKernel.NewProc("GlobalFree").Call(handle)
		comCall(object, 2)
		return 0, fmt.Errorf("Mémoire du transfert inaccessible")
	}
	buffer := unsafe.Slice((*byte)(unsafe.Pointer(memory)), bytes)
	binary.LittleEndian.PutUint32(buffer, 20)
	binary.LittleEndian.PutUint32(buffer[16:], 1)
	for i, value := range names {
		binary.LittleEndian.PutUint16(buffer[20+i*2:], value)
	}
	dragKernel.NewProc("GlobalUnlock").Call(handle)
	format := dragFormat{Format: 15, Aspect: 1, Index: -1, Medium: 1} // CF_HDROP / CONTENT / HGLOBAL
	medium := dragMedium{Medium: 1, Handle: handle}
	hr = comCall(object, 7, uintptr(unsafe.Pointer(&format)), uintptr(unsafe.Pointer(&medium)), 1)
	if err := dragHRESULT("Préparation des fichiers", hr); err != nil {
		dragKernel.NewProc("GlobalFree").Call(handle)
		comCall(object, 2)
		return 0, err
	}
	return object, nil // IDataObject owns HGLOBAL after SetData(fRelease=true).
}

func joinDragPaths(paths []string) string {
	value := ""
	for _, path := range paths {
		value += path + "\x00"
	}
	return value + "\x00"
}

// The browser owns the mouse input queue at the start of the gesture. Keep the
// queues attached until OLE finishes; detaching earlier strands the drag loop.
func dragSourceWindow() (uintptr, func(), error) {
	foreground, _, _ := dragUser.NewProc("GetForegroundWindow").Call()
	thread, _, _ := dragUser.NewProc("GetWindowThreadProcessId").Call(foreground, 0)
	own, _, _ := dragKernel.NewProc("GetCurrentThreadId").Call()
	attached, _, _ := dragUser.NewProc("AttachThreadInput").Call(own, thread, 1)
	if foreground == 0 || attached == 0 {
		return 0, nil, fmt.Errorf("Windows n'a pas pu reprendre le geste de souris")
	}
	var point struct{ X, Y int32 }
	dragUser.NewProc("GetCursorPos").Call(uintptr(unsafe.Pointer(&point)))
	class, _ := windows.UTF16PtrFromString("STATIC")
	title, _ := windows.UTF16PtrFromString(fmt.Sprintf("NextExplorer drag source %d", os.Getpid()))
	window, _, _ := dragUser.NewProc("CreateWindowExW").Call(0x80088, uintptr(unsafe.Pointer(class)), uintptr(unsafe.Pointer(title)), 0x80000000, uintptr(point.X), uintptr(point.Y), 1, 1, 0, 0, 0, 0)
	if window == 0 {
		if attached != 0 {
			dragUser.NewProc("AttachThreadInput").Call(own, thread, 0)
		}
		return 0, nil, fmt.Errorf("Fenêtre source du glissement indisponible")
	}
	dragUser.NewProc("SetLayeredWindowAttributes").Call(window, 0, 1, 2)
	dragUser.NewProc("ShowWindow").Call(window, 4)
	dragUser.NewProc("SetForegroundWindow").Call(window)
	current, _, _ := dragUser.NewProc("GetForegroundWindow").Call()
	if current != window {
		dragUser.NewProc("DestroyWindow").Call(window)
		dragUser.NewProc("AttachThreadInput").Call(own, thread, 0)
		return 0, nil, fmt.Errorf("Windows n'a pas activé la source du glissement")
	}
	dragUser.NewProc("ReleaseCapture").Call()
	dragUser.NewProc("SetCapture").Call(window)
	return window, func() {
		current, _, _ := dragUser.NewProc("GetForegroundWindow").Call()
		dragUser.NewProc("ReleaseCapture").Call()
		dragUser.NewProc("DestroyWindow").Call(window)
		if current == window {
			dragUser.NewProc("SetForegroundWindow").Call(foreground)
		}
		if attached != 0 {
			dragUser.NewProc("AttachThreadInput").Call(own, thread, 0)
		}
	}, nil
}

func nativeDrag(paths []string, stop <-chan struct{}) (M, error) {
	if !dragMutex.TryLock() {
		return nil, fmt.Errorf("Un glissement est déjà en cours")
	}
	defer dragMutex.Unlock()
	paths, err := dragPaths(paths)
	if err != nil {
		return nil, err
	}
	held, _, _ := dragUser.NewProc("GetAsyncKeyState").Call(1)
	if held&0x8000 == 0 {
		return M{"state": "cancelled"}, nil
	}
	select {
	case <-stop:
		return M{"state": "cancelled"}, nil
	default:
	}
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	hr, _, _ := dragOLE.NewProc("OleInitialize").Call(0)
	if err := dragHRESULT("Initialisation du glissement", hr); err != nil {
		return nil, err
	}
	defer dragOLE.NewProc("OleUninitialize").Call()
	window, cleanup, err := dragSourceWindow()
	if err != nil {
		return nil, err
	}
	defer cleanup()
	object, err := dragDataObject(paths)
	if err != nil {
		return nil, err
	}
	defer comCall(object, 2)
	held, _, _ = dragUser.NewProc("GetAsyncKeyState").Call(1)
	if held&0x8000 == 0 {
		return M{"state": "cancelled"}, nil
	}
	source := &dropSource{VTable: &sourceVTable, Stop: stop, Deadline: time.Now().Add(60 * time.Second)}
	var effect uint32
	// Shell supplies a drag image and the native allowed/forbidden cursor.
	hr, _, _ = dragShell.NewProc("SHDoDragDrop").Call(window, object, uintptr(unsafe.Pointer(source)), 1, uintptr(unsafe.Pointer(&effect))) // COPY only
	runtime.KeepAlive(source)
	if err := dragHRESULT("Glissement", hr); err != nil {
		return nil, err
	}
	if hr == dragDrop && effect&1 != 0 {
		return M{"state": "dropped", "count": len(paths)}, nil
	}
	return M{"state": "cancelled"}, nil
}
