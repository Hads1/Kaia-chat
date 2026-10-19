import ctypes
import json
import sys
from ctypes import wintypes

user32 = ctypes.windll.user32
user32.GetWindowLongW.argtypes = [wintypes.HWND, ctypes.c_int]
user32.GetWindowLongW.restype = ctypes.c_long
user32.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
user32.GetDpiForWindow.argtypes = [wintypes.HWND]
user32.GetDpiForWindow.restype = ctypes.c_uint
user32.SendMessageW.argtypes = [wintypes.HWND, ctypes.c_uint, ctypes.c_size_t, ctypes.c_ssize_t]
user32.SendMessageW.restype = ctypes.c_ssize_t
hwnd = int(sys.argv[1])
style = user32.GetWindowLongW(hwnd, -16) & 0xffffffff
extended = user32.GetWindowLongW(hwnd, -20) & 0xffffffff
rect = wintypes.RECT()
user32.GetWindowRect(hwnd, ctypes.byref(rect))
scale = user32.GetDpiForWindow(hwnd) / 96
x, y = int(rect.right - 69 * scale), int(rect.top + 23 * scale)
hit = user32.SendMessageW(hwnd, 0x84, 0, (y << 16) | (x & 65535))
print(json.dumps({
    'thickFrame': bool(style & 0x40000),
    'maximizeBox': bool(style & 0x10000),
    'caption': bool(style & 0xc00000),
    'maximizeHit': hit,
    'nativeSnapButton': hit == 9,
    'clickThrough': bool(extended & 0x20),
}))
