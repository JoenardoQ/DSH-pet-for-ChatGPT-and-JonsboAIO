"""Minimal MSDisplay SDK adapter. Uses the user's installed vendor DLL only.

ABI checked against JONSBO-AIO DeviceApi metadata and pyusbdisplay 0.1.2.
No EEPROM, flash, firmware, driver-install or register-write APIs are bound.
"""
import ctypes as C
import os
from pathlib import Path
import threading
import time


class Resolution(C.Structure):
    _fields_ = [('width', C.c_int), ('height', C.c_int), ('refresh', C.c_int)]


class Picture(C.Structure):
    _fields_ = [('width', C.c_int), ('height', C.c_int), ('data', C.c_void_p)]


class Timing(C.Structure):
    _fields_ = [(key, C.c_uint32) for key in ('vic', 'polarity', 'htotal', 'vtotal', 'hactive', 'vactive', 'pixclk', 'vfreq', 'hoffset', 'voffset', 'hsyncwidth', 'vsyncwidth')]


class Edid(C.Structure):
    _fields_ = [('mode', C.c_int), ('replace', C.c_ubyte * 128), ('count', C.c_int), ('timings', Timing * 16)]


Attach = C.CFUNCTYPE(None, C.c_uint32, C.POINTER(Resolution), C.c_int)
Detach = C.CFUNCTYPE(None, C.c_uint32)


class Display:
    def __init__(self, dll_path=None, width=480, height=480, serial=None):
        if os.name != 'nt' or C.sizeof(C.c_void_p) != 8:
            raise RuntimeError('USB output requires Windows x64 and 64-bit Python')
        path = Path(dll_path or Path(os.environ['LOCALAPPDATA']) / 'JONSBO-AIO/dll/x64/MSDISPLAYSDKWRRAPER.dll').resolve()
        if not path.is_file():
            raise RuntimeError('Install JONSBO-AIO first or set sdkDll in config.json')
        self.dll_dir = os.add_dll_directory(str(path.parent))
        usb_dir = path.parent.parent.parent / 'libusb/amd64'
        self.usb_dir = os.add_dll_directory(str(usb_dir)) if usb_dir.is_dir() else None
        self.dll = C.CDLL(str(path))  # cdecl, including callbacks
        self.width, self.height, self.serial = width, height, serial
        self.devices, self.selected, self.error = {}, None, None
        self.lock = threading.Lock()
        self.started = False
        self._bind('RegisterCallback', [Attach, Detach], None)
        self._bind('Start', [C.c_int, C.POINTER(Edid)])
        self._bind('Stop', [])
        self._bind('SetVideoParam', [C.c_uint32, C.POINTER(Resolution)])
        self._bind('SendPicture', [C.c_uint32, C.POINTER(Picture), C.c_bool])
        self._bind('ReadSN', [C.c_uint32, C.c_void_p])
        self.attach_cb, self.detach_cb = Attach(self._attach), Detach(self._detach)
        self.dll.Wrraper_MSDisplayRegisterCallback(self.attach_cb, self.detach_cb)

    def _bind(self, name, args, result=C.c_int):
        fn = getattr(self.dll, 'Wrraper_MSDisplay' + name)
        fn.argtypes, fn.restype = args, result

    @staticmethod
    def check(code, operation):
        if code != 0:
            raise RuntimeError(f'MSDisplay {operation} failed ({code})')

    def _attach(self, handle, resolutions, count):
        try:
            if count < 0 or count > 100 or (count and not resolutions):
                return
            # Callbacks only copy metadata; initialization stays on the render thread.
            values = [(resolutions[i].width, resolutions[i].height, resolutions[i].refresh) for i in range(count)]
            with self.lock:
                self.devices[handle] = values
        except Exception as exc:
            self.error = str(exc)

    def _detach(self, handle):
        with self.lock:
            self.devices.pop(handle, None)
            if self.selected == handle:
                self.selected = None

    def start(self):
        edid = Edid()
        # The VMAX 480x480 panel reports a generic 800x600 EDID. MSDisplay's
        # vendor 480-square mode is VIC 0x8F; append it in SDK memory only.
        # Values are the official application mode record documented at
        # https://github.com/codehz/msdisplay/blob/main/ms2160/RESEARCH_REPORT.md
        # Do not extrapolate these timings to other panel sizes.
        if (self.width, self.height) == (480, 480):
            edid.mode = 2
            edid.count = 1
            edid.timings[0] = Timing(0x8F, 7, 600, 490, 480, 480, 1764, 6000, 100, 8, 50, 4)
        self.check(self.dll.Wrraper_MSDisplayStart(0, C.byref(edid)), 'start')
        self.started = True

    def select(self):
        with self.lock:
            devices = dict(self.devices)
        matches = []
        for handle, modes in devices.items():
            matching = [m for m in modes if m[:2] == (self.width, self.height)]
            if not matching:
                continue
            if self.serial:
                serial = C.create_string_buffer(128)
                self.check(self.dll.Wrraper_MSDisplayReadSN(handle, serial), 'read serial')
                if serial.value.decode('ascii', errors='replace') != self.serial:
                    continue
            matches.append((handle, matching[0]))
        if len(matches) > 1:
            raise RuntimeError('Multiple matching USB screens; set serial in config.json')
        if not matches:
            return False
        handle, mode = matches[0]
        res = Resolution(*mode)
        self.check(self.dll.Wrraper_MSDisplaySetVideoParam(handle, C.byref(res)), 'set advertised resolution')
        self.selected = handle
        return True

    def send(self, image):
        if image.size != (self.width, self.height):
            raise ValueError('Frame size does not match configured panel')
        if self.selected is None and not self.select():
            return False
        pixels = image.convert('RGBA').tobytes('raw', 'BGRA')
        buffer = C.create_string_buffer(pixels)
        picture = Picture(self.width, self.height, C.cast(buffer, C.c_void_p))
        code = self.dll.Wrraper_MSDisplaySendPicture(self.selected, C.byref(picture), False)
        if code == -5:  # queue full: drop instead of building an unbounded frame queue
            return False
        if code in (-4, -6, -7):
            self.selected = None
            return False
        self.check(code, 'send picture')
        return True

    def close(self):
        if self.started:
            self.dll.Wrraper_MSDisplayStop()
            self.started = False
        self.dll_dir.close()
        if self.usb_dir:
            self.usb_dir.close()
