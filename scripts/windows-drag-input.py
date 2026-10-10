"""Physical input for an isolated Chrome drag test; never targets another window."""
import ctypes
from ctypes import wintypes
import json
import sys
import time
import os

user = ctypes.WinDLL("user32", use_last_error=True)
user.SetProcessDPIAware()
user.GetForegroundWindow.restype = wintypes.HWND
user.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
user.GetClientRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
user.ClientToScreen.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.POINT)]
user.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
user.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
user.SetForegroundWindow.argtypes = [wintypes.HWND]
user.SetWindowPos.argtypes = [wintypes.HWND, wintypes.HWND, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, wintypes.UINT]
user.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
user.WindowFromPoint.argtypes = [wintypes.POINT]
user.WindowFromPoint.restype = wintypes.HWND
user.GetAncestor.argtypes = [wintypes.HWND, wintypes.UINT]
user.GetAncestor.restype = wintypes.HWND
prefix, actions = sys.argv[1], json.loads(sys.argv[2])
if not prefix.startswith("NextExplorer drag test "):
    raise RuntimeError("An isolated test title is required")
windows = []

@ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
def collect(window, _):
    title = ctypes.create_unicode_buffer(512)
    user.GetWindowTextW(window, title, 512)
    if title.value.startswith(prefix) and user.IsWindowVisible(window):
        windows.append(window)
    return True

user.EnumWindows(collect, 0)
if len(windows) != 1:
    raise RuntimeError("Expected exactly one isolated Chrome test window")
window = windows[0]
def allowed_foreground():
    current = user.GetForegroundWindow()
    if current == window:
        return True
    if len(sys.argv) > 3:
        process = wintypes.DWORD()
        user.GetWindowThreadProcessId(current, ctypes.byref(process))
        title = ctypes.create_unicode_buffer(512)
        user.GetWindowTextW(current, title, 512)
        if title.value != "NextExplorer drag source " + str(process.value):
            return False
        if sys.argv[3].isdigit():
            return process.value == int(sys.argv[3])
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.OpenProcess.restype = wintypes.HANDLE
        kernel.QueryFullProcessImageNameW.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)]
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        handle = kernel.OpenProcess(0x1000, False, process.value)
        try:
            image, length = ctypes.create_unicode_buffer(1024), wintypes.DWORD(1024)
            return bool(kernel.QueryFullProcessImageNameW(handle, 0, image, ctypes.byref(length))) and os.path.normcase(image.value) == os.path.normcase(sys.argv[3])
        finally:
            kernel.CloseHandle(handle)
    return False
for action in actions:
    kind = action[0]
    if kind == "focus":
        own = ctypes.windll.kernel32.GetCurrentThreadId()
        foreground = user.GetWindowThreadProcessId(user.GetForegroundWindow(), None)
        user.AttachThreadInput(own, foreground, True)
        user.ShowWindow(window, 9)
        user.SetForegroundWindow(window)
        user.AttachThreadInput(own, foreground, False)
        if user.GetForegroundWindow() != window:
            user.SetWindowPos(window, -1, 0, 0, 0, 0, 0x13)
            rect = wintypes.RECT()
            user.GetWindowRect(window, ctypes.byref(rect))
            point = wintypes.POINT(rect.right - 220, rect.top + 15)
            user.SetCursorPos(point.x, point.y)
            if user.GetAncestor(user.WindowFromPoint(point), 2) != window:
                raise RuntimeError("Cannot safely activate the isolated window")
            user.mouse_event(2, 0, 0, 0, 0)
            user.mouse_event(4, 0, 0, 0, 0)
            user.SetWindowPos(window, -2, 0, 0, 0, 0, 0x13)
        time.sleep(.2)
    if not allowed_foreground():
        raise RuntimeError("Test window lost foreground; input stopped (expected %r, current %r, Windows error %r)" % (window, user.GetForegroundWindow(), ctypes.get_last_error()))
    if kind == "move":
        user.SetCursorPos(int(action[1]), int(action[2]))
    elif kind == "down":
        user.mouse_event(2, 0, 0, 0, 0)
    elif kind == "up":
        user.mouse_event(4, 0, 0, 0, 0)
    elif kind == "escape":
        user.keybd_event(27, 0, 0, 0)
        user.keybd_event(27, 0, 2, 0)
    elif kind == "panel":
        for code in [17, 16, 89]:
            user.keybd_event(code, 0, 0, 0)
        for code in [89, 16, 17]:
            user.keybd_event(code, 0, 2, 0)
    elif kind == "pause":
        time.sleep(min(float(action[1]), 2))
    elif kind == "info":
        rect, point = wintypes.RECT(), wintypes.POINT()
        user.GetClientRect(window, ctypes.byref(rect))
        user.ClientToScreen(window, ctypes.byref(point))
        print(json.dumps(dict(x=point.x, y=point.y, height=rect.bottom, width=rect.right)))
