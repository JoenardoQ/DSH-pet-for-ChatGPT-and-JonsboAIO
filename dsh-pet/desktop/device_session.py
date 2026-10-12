"""Detect compatible hardware; lease its output and restore only what we stopped."""
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


class DeviceSession:
    def __init__(self,config,data_dir):
        self.config=config
        self.marker=Path(data_dir)/'display-owner.json'
        self.owned={}
        if self.marker.exists():
            try:self.owned=json.loads(self.marker.read_text(encoding='utf-8'))
            except (ValueError,OSError):pass

    def save(self):
        self.marker.parent.mkdir(parents=True,exist_ok=True)
        self.marker.write_text(json.dumps(self.owned),encoding='utf-8')

    def previous_bridge(self,restore=False):
        # Explicit compatibility with project 1; never act on an unidentified service.
        base='http://127.0.0.1:19389'
        try:
            with urllib.request.urlopen(base+'/state',timeout=.5) as response:state=json.load(response)
            if state.get('service')!='whale-musume' or state.get('version')!=1:return
            if not restore and not (state.get('source')=='chatgpt' and state.get('screen')):return
            request=urllib.request.Request(base+'/event',data=json.dumps({'source':'chatgpt','action':'update','screen':restore}).encode(),headers={'Content-Type':'application/json','X-Whale-Client':'1'},method='POST')
            if not restore:self.owned['legacy']=True;self.save()
            with urllib.request.urlopen(request,timeout=1):pass
        except Exception:pass

    def prepare(self):
        if os.name!='nt':return {'usb':'unsupported-platform','error':'乔斯伯输出需要 Windows x64。'}
        devices=present_devices()
        if not devices:return {'usb':'waiting-device','devices':[],'error':None}
        if len(devices)>1 and not self.config.get('serial'):
            return {'usb':'multiple-devices','devices':devices,'error':'检测到多个兼容屏幕，请在配置中选择 serial。'}
        processes=vendor_processes()
        sdk=find_sdk(self.config,processes)
        if not sdk:return {'usb':'missing-sdk','devices':devices,'error':'已检测到乔斯伯屏幕。请先安装官方 JONSBO-AIO 驱动和 SDK；插件不会自动安装驱动。'}
        if self.config.get('autoTakeover',True):
            for process in processes:
                executable=process.get('path')
                if not executable or Path(executable).name.lower()!=VENDOR_IMAGE:
                    return {'usb':'busy','error':'官方程序正在占用屏幕，无法读取其启动路径；请从托盘退出（可能以管理员运行）。'}
                self.owned['vendor']=executable;self.save()
                if not close_vendor(process['pid'],self.config.get('forceTakeover',False)):
                    # We did not stop it, so must not restart it on release.
                    self.owned.pop('vendor',None);self.save()
                    return {'usb':'busy','error':'已请求官方程序退出，但它仍在占用。点击预览页“接管屏幕”允许结束该程序，或从托盘退出。'}
            self.previous_bridge()
        elif processes:return {'usb':'busy','error':'官方程序正在占用屏幕；自动接管已关闭。'}
        return {'usb':'ready','devices':devices,'sdkDll':str(sdk)}

    def restore(self):
        if not self.owned:return
        if self.config.get('restoreOnExit',True):
            executable=self.owned.get('vendor')
            if executable and Path(executable).is_file() and Path(executable).name.lower()==VENDOR_IMAGE and not vendor_processes():
                startup=subprocess.STARTUPINFO();startup.dwFlags|=subprocess.STARTF_USESHOWWINDOW;startup.wShowWindow=0
                subprocess.Popen([executable],cwd=str(Path(executable).parent),startupinfo=startup,creationflags=0x00000008,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            if self.owned.get('legacy'):self.previous_bridge(restore=True)
        self.owned={}
        self.marker.unlink(missing_ok=True)
