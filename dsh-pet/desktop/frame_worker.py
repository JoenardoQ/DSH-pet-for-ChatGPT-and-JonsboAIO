"""Same MSDisplay adapter as project 1; input is an actual Chromium video frame."""
import argparse
import base64
import io
import json
import os
from pathlib import Path
import queue
import subprocess
import sys
import threading
import time
from PIL import Image
from device_session import DeviceSession


def decode_frame(png, width=480, height=480, rotation=0):
    if rotation not in (0, 90, 180, 270):
        raise ValueError('Invalid rotation')
    with Image.open(io.BytesIO(base64.b64decode(png, validate=True))) as image:
        if image.format != 'PNG' or image.size != (480, 480):
            raise ValueError('Expected a 480x480 PNG frame')
        frame = image.convert('RGB')
    if rotation:
        frame = frame.rotate(-rotation, expand=True)
    return frame.resize((width, height), Image.Resampling.LANCZOS)


def emit(**data):
    print(json.dumps(data, ensure_ascii=True), flush=True)


def run(config, data_dir):
    updates = queue.Queue(maxsize=1)
    stop = threading.Event()
    def read_input():
        try:
            for line in sys.stdin:
                if len(line) > 2000000:
                    raise ValueError('Frame exceeds input limit')
                value = json.loads(line)
                try:
                    updates.get_nowait()
                except queue.Empty:
                    pass
                updates.put_nowait(value)
        finally:
            stop.set()
    threading.Thread(target=read_input, daemon=True).start()
    width, height = int(config.get('width', 480)), int(config.get('height', 480))
    rotation = int(config.get('rotation', 0))
    if not (64 <= width <= 2048 and 64 <= height <= 2048) or rotation not in (0,90,180,270):
        raise ValueError('Invalid dimensions or rotation')
    display = None
    frame = None
    last_input = 0
    retry_at = 0
    last_status = None
    frames = 0
    waiting_since = 0
    session = DeviceSession(config, data_dir)
    def report(**value):
        nonlocal last_status
        if value != last_status:
            emit(**value)
            last_status = value
    def release():
        nonlocal display
        if display:
            try:
                display.send(Image.new('RGB', (width,height)))
                time.sleep(.1)
            finally:
                display.close()
                display = None
    emit(worker='ready',usb='inactive')
    try:
        while not stop.is_set():
            try:
                try:
                    value = updates.get_nowait()
                    frame = decode_frame(value['png'],width,height,rotation)
                    last_input = time.monotonic()
                except queue.Empty:
                    pass
                if frame is None or time.monotonic()-last_input > 3 or not config.get('usb',True):
                    release()
                    session.restore()
                    report(usb='inactive')
                else:
                    if not display and time.monotonic() >= retry_at:
                        config_file=Path(data_dir)/'config.json'
                        if config_file.exists():config.update(json.loads(config_file.read_text(encoding='utf-8-sig')))
                        prepared=session.prepare()
                        if prepared['usb']!='ready':
                            report(**prepared)
                            retry_at = time.monotonic()+5
                        else:
                            from msdisplay import Display
                            display=Display(prepared['sdkDll'],width,height,config.get('serial'))
                            display.start()
                            waiting_since=time.monotonic()
                    if display:
                        sent=display.send(frame)
                        frames += int(bool(sent))
                        with display.lock:
                            modes=list(display.devices.values())
                        report(usb='streaming' if sent else 'waiting-device',width=width,height=height,frames=frames,modes=modes,error=None)
                        if sent:
                            waiting_since=time.monotonic()
                        elif time.monotonic()-waiting_since>5:
                            release()
                            retry_at=time.monotonic()+1
            except Exception as exc:
                report(usb='error',error=str(exc))
                try:
                    release()
                except Exception:
                    pass
                retry_at=time.monotonic()+5
            stop.wait(1/max(1,min(15,int(config.get('fps',10)))))
    finally:
        try:
            release()
        finally:
            session.restore()


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--config',type=Path,required=True)
    args=parser.parse_args()
    config=json.loads(args.config.read_text(encoding='utf-8-sig')) if args.config.exists() else {}
    try:
        run(config,args.config.parent)
    except Exception as exc:
        emit(worker='error',usb='error',error=str(exc))
        raise
