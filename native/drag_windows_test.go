package main

import (
	"encoding/binary"
	"runtime"
	"syscall"
	"testing"
	"unicode/utf16"
	"unsafe"
)

func TestDragShellDataObject(t *testing.T) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	hr, _, _ := dragOLE.NewProc("OleInitialize").Call(0)
	if err := dragHRESULT("OLE", hr); err != nil {
		t.Fatal(err)
	}
	defer dragOLE.NewProc("OleUninitialize").Call()
	paths := []string{`C:\recette\pièce.txt`, `D:\autre\large.tiff`}
	object, err := dragDataObject(paths)
	if err != nil {
		t.Fatal(err)
	}
	defer comCall(object, 2)
	var enumerator uintptr
	hr = comCall(object, 8, 1, uintptr(unsafe.Pointer(&enumerator)))
	if err := dragHRESULT("EnumFormatEtc", hr); err != nil {
		t.Fatal(err)
	}
	defer comCall(enumerator, 2)
	found := false
	for i := 0; i < 32; i++ {
		var item dragFormat
		var fetched uint32
		hr = comCall(enumerator, 3, 1, uintptr(unsafe.Pointer(&item)), uintptr(unsafe.Pointer(&fetched)))
		if err := dragHRESULT("Next format", hr); err != nil {
			t.Fatal(err)
		}
		if fetched == 0 {
			break
		}
		if item.Format == 15 && item.Medium&1 != 0 {
			found = true
		}
		if item.Target != 0 {
			dragOLE.NewProc("CoTaskMemFree").Call(item.Target)
		}
	}
	if !found {
		t.Fatal("CF_HDROP not advertised to the receiving application")
	}
	format := dragFormat{Format: 15, Aspect: 1, Index: -1, Medium: 1}
	var medium dragMedium
	hr = comCall(object, 3, uintptr(unsafe.Pointer(&format)), uintptr(unsafe.Pointer(&medium)))
	if err := dragHRESULT("GetData", hr); err != nil {
		t.Fatal(err)
	}
	defer dragOLE.NewProc("ReleaseStgMedium").Call(uintptr(unsafe.Pointer(&medium)))
	memory, _, _ := dragKernel.NewProc("GlobalLock").Call(medium.Handle)
	if memory == 0 {
		t.Fatal("GlobalLock")
	}
	defer dragKernel.NewProc("GlobalUnlock").Call(medium.Handle)
	expected := utf16.Encode([]rune(joinDragPaths(paths)))
	bytes := unsafe.Slice((*byte)(unsafe.Pointer(memory)), 20+len(expected)*2)
	if binary.LittleEndian.Uint32(bytes) != 20 || binary.LittleEndian.Uint32(bytes[16:]) != 1 {
		t.Fatal("DROPFILES header")
	}
	for i, value := range expected {
		if binary.LittleEndian.Uint16(bytes[20+i*2:]) != value {
			t.Fatal("UTF16 paths")
		}
	}
}

func TestDragCancelledOnDisconnect(t *testing.T) {
	stop := make(chan struct{})
	close(stop)
	source := &dropSource{VTable: &sourceVTable, Stop: stop}
	hr, _, _ := syscall.SyscallN(sourceVTable[3], uintptr(unsafe.Pointer(source)), 0, 1)
	runtime.KeepAlive(source)
	if hr != dragCancel {
		t.Fatalf("disconnect result: %x", hr)
	}
}
