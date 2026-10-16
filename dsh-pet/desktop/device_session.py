"""Detect compatible hardware; lease its output and restore only what we stopped."""
import base64
import csv
import ctypes as C
from ctypes import wintypes as W
import io
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.request
from screen_lease import ScreenLease, ScreenBusy, WAITING

VENDOR_IMAGE = 'jonsbo-aio.exe'
SUPPORTED_ID = 'VID_345F&PID_9132'

def compatible_device(instance):
    # Composite USB interfaces (MI_00/MI_03) belong to the same physical screen.
    return instance.upper().startswith('USB\\'+SUPPORTED_ID+'\\')


def present_devices():
    if os.name != 'nt':
        return []
    class Info(C.Structure):
        _fields_=[('cbSize',W.DWORD),('guid',C.c_byte*16),('devInst',W.DWORD),('reserved',C.c_size_t)]
    api=C.WinDLL('setupapi',use_last_error=True)
    api.SetupDiGetClassDevsW.argtypes=[C.c_void_p,W.LPCWSTR,W.HWND,W.DWORD]
    api.SetupDiGetClassDevsW.restype=W.HANDLE
    api.SetupDiEnumDeviceInfo.argtypes=[W.HANDLE,W.DWORD,C.POINTER(Info)]
    api.SetupDiGetDeviceInstanceIdW.argtypes=[W.HANDLE,C.POINTER(Info),W.LPWSTR,W.DWORD,C.c_void_p]
    api.SetupDiDestroyDeviceInfoList.argtypes=[W.HANDLE]
    handle=api.SetupDiGetClassDevsW(None,'USB',None,6) # PRESENT | ALLCLASSES
    if handle==C.c_void_p(-1).value:
        raise OSError(C.get_last_error(),'Cannot enumerate USB devices')
    devices=[]
    try:
        index=0
        while True:
            info=Info();info.cbSize=C.sizeof(info)
            if not api.SetupDiEnumDeviceInfo(handle,index,C.byref(info)):
                break
            value=C.create_unicode_buffer(1024)
            if api.SetupDiGetDeviceInstanceIdW(handle,C.byref(info),value,1024,None):
                if compatible_device(value.value):devices.append(value.value)
            index+=1
    finally:
        api.SetupDiDestroyDeviceInfoList(handle)
    return devices


def process_path(pid):
    kernel=C.WinDLL('kernel32',use_last_error=True)
    kernel.OpenProcess.argtypes=[W.DWORD,W.BOOL,W.DWORD];kernel.OpenProcess.restype=W.HANDLE
    kernel.QueryFullProcessImageNameW.argtypes=[W.HANDLE,W.DWORD,W.LPWSTR,C.POINTER(W.DWORD)]
    kernel.CloseHandle.argtypes=[W.HANDLE]
    handle=kernel.OpenProcess(0x1000,False,pid)
    if not handle:return None
    try:
        size=W.DWORD(32768);buf=C.create_unicode_buffer(size.value)
        return buf.value if kernel.QueryFullProcessImageNameW(handle,0,buf,C.byref(size)) else None
    finally:kernel.CloseHandle(handle)


def vendor_processes():
    if os.name!='nt':return []
    result=subprocess.run(['tasklist.exe','/FI','IMAGENAME eq JONSBO-AIO.exe','/FO','CSV','/NH'],capture_output=True,creationflags=0x08000000,timeout=5)
    rows=csv.reader(io.StringIO(result.stdout.decode('utf-8',errors='replace')))
    return [{'pid':int(row[1]),'path':process_path(int(row[1]))} for row in rows if len(row)>1 and row[0].lower()==VENDOR_IMAGE and row[1].isdigit()]


def find_sdk(config, processes):
    if config.get('sdkDll'):
        specified=Path(config['sdkDll'])
        return specified if specified.is_file() else None
    local=Path(os.environ.get('LOCALAPPDATA',''))/'JONSBO-AIO'
    roots=[local]
    roots.extend(Path(p['path']).parent for p in processes if p.get('path'))
    try:
        import winreg
        for hive in (winreg.HKEY_CURRENT_USER,winreg.HKEY_LOCAL_MACHINE):
            for keyname in (r'Software\Microsoft\Windows\CurrentVersion\Uninstall',r'Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'):
                try:
                    with winreg.OpenKey(hive,keyname) as key:
                        for i in range(winreg.QueryInfoKey(key)[0]):
                            with winreg.OpenKey(key,winreg.EnumKey(key,i)) as entry:
                                try:
                                    name=winreg.QueryValueEx(entry,'DisplayName')[0]
                                    if 'jonsbo' in str(name).lower():roots.append(Path(winreg.QueryValueEx(entry,'InstallLocation')[0]))
                                except OSError:pass
                except OSError:pass
    except ImportError:pass
    for root in roots:
        for candidate in (root/'dll/x64/MSDISPLAYSDKWRRAPER.dll',root/'MSDISPLAYSDKWRRAPER.dll',root.parent/'dll/x64/MSDISPLAYSDKWRRAPER.dll'):
            if candidate.is_file():return candidate
    return None


def close_vendor(pid, force):
    # First request ordinary window shutdown; tray-only apps may ignore WM_CLOSE.
    user=C.WinDLL('user32',use_last_error=True)
    callback=C.WINFUNCTYPE(W.BOOL,W.HWND,W.LPARAM)
    user.GetWindowThreadProcessId.argtypes=[W.HWND,C.POINTER(W.DWORD)]
    user.PostMessageW.argtypes=[W.HWND,W.UINT,W.WPARAM,W.LPARAM]
    user.EnumWindows.argtypes=[callback,W.LPARAM]
    @callback
    def visit(window,param):
        owner=W.DWORD();user.GetWindowThreadProcessId(window,C.byref(owner))
        if owner.value==pid:user.PostMessageW(window,0x10,0,0)
        return True
    user.EnumWindows(visit,0)
    time.sleep(.6)
    alive=any(p['pid']==pid for p in vendor_processes())
    if alive and force:
        subprocess.run(['taskkill.exe','/PID',str(pid),'/F'],capture_output=True,creationflags=0x08000000,timeout=5)
    return not any(p['pid']==pid for p in vendor_processes())


def elevated_close_vendor(pid, result_file):
    """One explicit UI request, one UAC prompt; only the verified vendor PID."""
    quote = lambda value: "'" + str(value).replace("'", "''") + "'"
    script = (
        "$ErrorActionPreference='Stop';try{"
        f"$p=Get-Process -Id {int(pid)};"
        "if([IO.Path]::GetFileName($p.Path) -ine 'JONSBO-AIO.exe'){throw 'Unexpected process'};"
        "$exe=$p.Path;Stop-Process -InputObject $p -Force -ErrorAction Stop;"
        f"[IO.File]::WriteAllText({quote(result_file)},($exe|ConvertTo-Json),[Text.UTF8Encoding]::new($false))"
        "}catch{"
        f"[IO.File]::WriteAllText({quote(result_file)},(@{{ok=$false;error=$_.Exception.Message}}|ConvertTo-Json),[Text.UTF8Encoding]::new($false));exit 1}}"
    )
    encoded = base64.b64encode(script.encode('utf-16le')).decode('ascii')
    class ShellInfo(C.Structure):
        _fields_=[('cbSize',W.DWORD),('fMask',C.c_ulong),('hwnd',W.HWND),('lpVerb',W.LPCWSTR),('lpFile',W.LPCWSTR),('lpParameters',W.LPCWSTR),('lpDirectory',W.LPCWSTR),('nShow',C.c_int),('hInstApp',W.HINSTANCE),('lpIDList',C.c_void_p),('lpClass',W.LPCWSTR),('hkeyClass',W.HKEY),('dwHotKey',W.DWORD),('hIcon',W.HANDLE),('hProcess',W.HANDLE)]
    shell=C.WinDLL('shell32',use_last_error=True);kernel=C.WinDLL('kernel32',use_last_error=True)
    shell.ShellExecuteExW.argtypes=[C.POINTER(ShellInfo)];shell.ShellExecuteExW.restype=W.BOOL
    kernel.WaitForSingleObject.argtypes=[W.HANDLE,W.DWORD];kernel.CloseHandle.argtypes=[W.HANDLE]
    info=ShellInfo();info.cbSize=C.sizeof(info);info.fMask=0x40;info.lpVerb='runas'
    info.lpFile=str(Path(os.environ.get('SystemRoot',r'C:\Windows'))/'System32/WindowsPowerShell/v1.0/powershell.exe')
    info.lpParameters='-NoProfile -NonInteractive -EncodedCommand '+encoded;info.nShow=0
    if not shell.ShellExecuteExW(C.byref(info)):
        code=C.get_last_error()
        if code==1223:raise PermissionError('Windows 权限确认已取消；再次点击接管才会重试。')
        raise OSError(code,'Windows 无法打开权限确认：'+C.FormatError(code))
    try:
        if kernel.WaitForSingleObject(info.hProcess,60000)==258:
            raise TimeoutError('Windows 权限确认等待超时；请确认系统窗口后重试连接。')
        if result_file.is_file():
            result=json.loads(result_file.read_text(encoding='utf-8-sig'))
            if isinstance(result,dict):raise PermissionError('管理员接管失败：'+str(result.get('error','未知原因')))
            return result
        raise PermissionError('管理员命令未能结束官方程序；可从 JONSBO-AIO 托盘退出后重连。')
    finally:kernel.CloseHandle(info.hProcess)


class DeviceSession:
    def __init__(self,config,data_dir,progress=None):
        self.config=config
        self.progress=progress or (lambda **value:None)
        self.takeover_error = None
        self.restore_attempted = False
        self.marker=Path(data_dir)/'display-owner.json'
        self.request_file = Path(data_dir)/'takeover-request.txt'
        self.takeover_request = self.request_file.read_text(encoding='utf8') if self.request_file.exists() else None
        self.owned={}
        result_file=Path(data_dir)/'takeover-result.json'
        if result_file.exists():
            try:
                result=json.loads(result_file.read_text(encoding='utf-8-sig'))
                if isinstance(result,dict) and result.get('request')==self.takeover_request:
                    self.takeover_error=result.get('error')
            except (ValueError,OSError):pass
        if self.marker.exists():
            try:self.owned=json.loads(self.marker.read_text(encoding='utf-8'))
            except (ValueError,OSError):pass

    def save(self):
        self.marker.parent.mkdir(parents=True,exist_ok=True)
        self.marker.write_text(json.dumps(self.owned),encoding='utf-8')

    def prepare(self):
        try:
            with ScreenLease():
                return self._prepare()
        except ScreenBusy:
            return {'usb': 'waiting-screen', 'error': WAITING}

    def restore(self):
        if not self.owned:
            return
        try:
            with ScreenLease():
                self._restore()
        except ScreenBusy:
            pass  # Keep restore intent; never restart the vendor over another pet.

    def _prepare(self):
        if os.name!='nt':return {'usb':'unsupported-platform','error':'乔斯伯输出需要 Windows x64。'}
        devices=present_devices()
        if not devices:return {'usb':'waiting-device','devices':[],'error':None}
        if len(devices)>1 and not self.config.get('serial'):
            return {'usb':'multiple-devices','devices':devices,'error':'检测到多个兼容屏幕，请在配置中选择 serial。'}
        processes=vendor_processes()
        sdk=find_sdk(self.config,processes)
        if not sdk:return {'usb':'missing-sdk','devices':devices,'error':'已检测到乔斯伯屏幕。请先安装官方 JONSBO-AIO 驱动和 SDK；插件不会自动安装驱动。'}
        if self.config.get('autoTakeover',True):
            request = self.config.get('takeoverRequest')
            elevate = bool(request and request != self.takeover_request)
            if elevate:
                self.takeover_error = None
                self.request_file.parent.mkdir(parents=True,exist_ok=True)
                self.request_file.write_text(str(request),encoding='utf8')
                self.takeover_request = request
            for process in processes:
                executable=process.get('path')
                verified = executable and Path(executable).name.lower()==VENDOR_IMAGE
                stopped = verified and close_vendor(process['pid'],self.config.get('forceTakeover',False))
                if not stopped and elevate:
                    result_file = self.marker.parent/'takeover-result.json'
                    result_file.unlink(missing_ok=True)
                    self.progress(usb='requesting-permission',error='请在 Windows 权限窗口中允许退出官方程序；取消后不会反复弹窗。')
                    try:executable = elevated_close_vendor(process['pid'],result_file)
                    except (OSError,TimeoutError,ValueError) as error:
                        self.takeover_error = str(error)
                        result_file.write_text(json.dumps({'ok':False,'error':self.takeover_error,'request':request}),encoding='utf8')
                        return {'usb':'permission-required','error':self.takeover_error}
                    stopped = bool(executable and Path(executable).name.lower()==VENDOR_IMAGE
                        and not any(p['pid']==process['pid'] for p in vendor_processes()))
                if not stopped:
                    return {'usb':'permission-required' if self.config.get('forceTakeover') else 'busy',
                        'error':self.takeover_error or '官方程序仍在占用屏幕。点击“以管理员权限接管屏幕”，并在 Windows 权限窗口中允许；取消后不会反复弹窗。' if self.config.get('forceTakeover') else '官方程序正在占用屏幕；点击“接管屏幕”或从托盘退出。'}
                self.owned['vendor']=executable;self.save()
        elif processes:return {'usb':'busy','error':'官方程序正在占用屏幕；自动接管已关闭。'}
        self.restore_attempted=False
        if self.owned.pop('restoreError',None):self.save()
        return {'usb':'ready','devices':devices,'sdkDll':str(sdk)}

    def _restore(self):
        if not self.owned:return
        if self.config.get('restoreOnExit',True):
            executable=self.owned.get('vendor')
            if executable and Path(executable).is_file() and Path(executable).name.lower()==VENDOR_IMAGE and not vendor_processes():
                if self.restore_attempted and self.owned.get('restoreError'):return
                startup=subprocess.STARTUPINFO();startup.dwFlags|=subprocess.STARTF_USESHOWWINDOW;startup.wShowWindow=0
                try:
                    subprocess.Popen([executable],cwd=str(Path(executable).parent),startupinfo=startup,creationflags=0x00000008,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
                except OSError as error:
                    if getattr(error,'winerror',None)!=740:raise
                    if self.restore_attempted:return
                    self.restore_attempted=True
                    try:os.startfile(executable,operation='runas',cwd=str(Path(executable).parent),show_cmd=0)
                    except OSError as denied:
                        self.owned['restoreError']=str(denied);self.save();return
            # Older legacy markers must not re-enable another pet's output.
        self.owned={}
        self.marker.unlink(missing_ok=True)
