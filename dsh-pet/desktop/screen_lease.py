"""One Windows kernel lease shared by both pets. No SDK call before ownership."""
import ctypes as C
from ctypes import wintypes as W
import os
import threading

_guard = threading.Lock()
WAITING = '另一只桌宠正在投屏，请先在它的界面关闭投屏；释放后会自动连接。'

class ScreenBusy(RuntimeError):
    pass

class ScreenLease:
    def __init__(self):
        self.handle = None
        self.held = False

    def acquire(self):
        if self.held:
            return True
        if not _guard.acquire(blocking=False):
            return False
        try:
            if os.name != 'nt':
                self.held = True
                return True
            self.kernel = C.WinDLL('kernel32', use_last_error=True)
            self.kernel.CreateMutexW.argtypes = [C.c_void_p, W.BOOL, W.LPCWSTR]
            self.kernel.CreateMutexW.restype = W.HANDLE
            self.kernel.WaitForSingleObject.argtypes = [W.HANDLE, W.DWORD]
            self.kernel.WaitForSingleObject.restype = W.DWORD
            self.kernel.ReleaseMutex.argtypes = [W.HANDLE]
            self.kernel.CloseHandle.argtypes = [W.HANDLE]
            name = os.environ.get('JONSBO_SCREEN_LOCK_NAME', r'Local\DSH.Jonsbo.Display.v1')
            self.handle = self.kernel.CreateMutexW(None, False, name)
            if not self.handle:
                raise C.WinError(C.get_last_error())
            result = self.kernel.WaitForSingleObject(self.handle, 0)
            if result in (0, 0x80):
                self.held = True
                return True
            self.kernel.CloseHandle(self.handle)
            self.handle = None
            if result != 0x102:
                raise OSError('Cannot acquire JONSBO display lease')
            _guard.release()
            return False
        except BaseException:
            if self.handle:
                self.kernel.CloseHandle(self.handle)
                self.handle = None
            _guard.release()
            raise

    def close(self):
        if self.held:
            self.held = False
            try:
                if self.handle:
                    self.kernel.ReleaseMutex(self.handle)
                    self.kernel.CloseHandle(self.handle)
                    self.handle = None
            finally:
                _guard.release()

    def __enter__(self):
        if not self.acquire():
            raise ScreenBusy(WAITING)
        return self

    def __exit__(self, *args):
        self.close()

def available():
    lease = ScreenLease()
    try:
        return lease.acquire()
    finally:
        lease.close()
