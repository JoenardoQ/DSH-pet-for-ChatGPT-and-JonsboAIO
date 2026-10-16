import os
import uuid
import tempfile
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'desktop'))
import device_session as d

class SessionTests(unittest.TestCase):
    def setUp(self):
        isolated = patch.dict(os.environ, {'JONSBO_SCREEN_LOCK_NAME': r'Local\JonsboUnit-' + uuid.uuid4().hex})
        isolated.start()
        self.addCleanup(isolated.stop)

    def test_composite_interfaces_are_not_extra_screens(self):
        self.assertTrue(d.compatible_device('USB\\VID_345F&PID_9132\\SERIAL'))
        self.assertFalse(d.compatible_device('USB\\VID_345F&PID_9132&MI_03\\INTERFACE'))
    def test_no_hardware_never_stops_vendor(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(d,'present_devices',return_value=[]), patch.object(d,'vendor_processes') as processes:
            s=d.DeviceSession({},directory)
            self.assertEqual(s.prepare()['usb'],'waiting-device')
            processes.assert_not_called()

    def test_missing_sdk_never_stops_vendor(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(d,'present_devices',return_value=['USB/'+d.SUPPORTED_ID]), patch.object(d,'vendor_processes',return_value=[]), patch.object(d,'find_sdk',return_value=None), patch.object(d,'close_vendor') as close:
            self.assertEqual(d.DeviceSession({},directory).prepare()['usb'],'missing-sdk')
            close.assert_not_called()

    def test_stubborn_vendor_is_not_recorded_as_stopped(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(d,'present_devices',return_value=['USB/'+d.SUPPORTED_ID]), patch.object(d,'vendor_processes',return_value=[{'pid':42,'path':'C:/JONSBO/JONSBO-AIO.exe'}]), patch.object(d,'find_sdk',return_value=Path('sdk.dll')), patch.object(d,'close_vendor',return_value=False):
            s=d.DeviceSession({},directory)
            self.assertEqual(s.prepare()['usb'],'busy')
            self.assertNotIn('vendor',s.owned)

    def test_successful_handoff_records_exact_program(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(d,'present_devices',return_value=['USB/'+d.SUPPORTED_ID]), patch.object(d,'vendor_processes',return_value=[{'pid':42,'path':'C:/JONSBO/JONSBO-AIO.exe'}]), patch.object(d,'find_sdk',return_value=Path('sdk.dll')), patch.object(d,'close_vendor',return_value=True) as close:
            s=d.DeviceSession({'forceTakeover':True},directory)
            self.assertEqual(s.prepare()['usb'],'ready')
            close.assert_called_once_with(42,True)
            self.assertEqual(s.owned['vendor'],'C:/JONSBO/JONSBO-AIO.exe')

    def test_multiple_screens_require_selection(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(d,'present_devices',return_value=['one','two']), patch.object(d,'close_vendor') as close:
            self.assertEqual(d.DeviceSession({},directory).prepare()['usb'],'multiple-devices')
            close.assert_not_called()

    def test_elevation_requires_a_fresh_explicit_click_and_is_not_replayed(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(d,'present_devices',return_value=['screen']), patch.object(d,'find_sdk',return_value=Path('sdk.dll')), patch.object(d,'vendor_processes',return_value=[{'pid':42,'path':None}]), patch.object(d,'elevated_close_vendor',return_value=None) as elevate:
            cfg={'forceTakeover':True}
            session=d.DeviceSession(cfg,directory)
            self.assertEqual(session.prepare()['usb'],'permission-required');elevate.assert_not_called()
            cfg['takeoverRequest']='first-click'
            session.prepare();session.prepare();d.DeviceSession(cfg,directory).prepare()
            self.assertEqual(elevate.call_count,1)
            cfg['takeoverRequest']='second-click';session.prepare()
            self.assertEqual(elevate.call_count,2)

    def test_elevated_handoff_preserves_exact_restore_path(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(d,'present_devices',return_value=['screen']), patch.object(d,'find_sdk',return_value=Path('sdk.dll')), patch.object(d,'vendor_processes',side_effect=[[{'pid':42,'path':None}],[]]), patch.object(d,'elevated_close_vendor',return_value='C:/JONSBO/JONSBO-AIO.exe'):
            session=d.DeviceSession({'forceTakeover':True,'takeoverRequest':'click'},directory)
            self.assertEqual(session.prepare()['usb'],'ready')
            self.assertEqual(session.owned['vendor'],'C:/JONSBO/JONSBO-AIO.exe')

    def test_failed_consent_is_reported_without_repeating_or_losing_error(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(d,'present_devices',return_value=['screen']), patch.object(d,'find_sdk',return_value=Path('sdk.dll')), patch.object(d,'vendor_processes',return_value=[{'pid':42,'path':None}]), patch.object(d,'elevated_close_vendor',side_effect=PermissionError('Windows consent canceled')) as elevate:
            cfg={'forceTakeover':True,'takeoverRequest':'click'}
            progress=[]
            session=d.DeviceSession(cfg,directory,progress=lambda **value:progress.append(value))
            for attempt in range(3):
                current=session if attempt<2 else d.DeviceSession(cfg,directory)
                status=current.prepare()
                self.assertEqual(status['usb'],'permission-required')
                self.assertEqual(status['error'],'Windows consent canceled')
            self.assertEqual(elevate.call_count,1)
            self.assertEqual(progress[0]['usb'],'requesting-permission')

    def test_restore_admin_vendor_uses_exact_saved_program(self):
        required=OSError('elevation required');required.winerror=740
        with tempfile.TemporaryDirectory() as directory, patch.object(d,'vendor_processes',return_value=[]), patch.object(d.subprocess,'Popen',side_effect=required), patch.object(d.os,'startfile') as launch:
            executable=Path(directory)/'JONSBO-AIO.exe';executable.touch()
            session=d.DeviceSession({},directory);session.owned={'vendor':str(executable)};session.save()
            session.restore()
            launch.assert_called_once_with(str(executable),operation='runas',cwd=directory,show_cmd=0)
            self.assertEqual(session.owned,{})

    def test_restore_consent_cancellation_preserves_intent_without_repeated_prompts(self):
        required=OSError('elevation required');required.winerror=740
        with tempfile.TemporaryDirectory() as directory, patch.object(d,'vendor_processes',return_value=[]), patch.object(d.subprocess,'Popen',side_effect=required) as ordinary, patch.object(d.os,'startfile',side_effect=PermissionError('canceled')) as launch:
            executable=Path(directory)/'JONSBO-AIO.exe';executable.touch()
            session=d.DeviceSession({},directory);session.owned={'vendor':str(executable)};session.save()
            session.restore();session.restore()
            self.assertEqual(launch.call_count,1);self.assertEqual(ordinary.call_count,1)
            self.assertEqual(session.owned['vendor'],str(executable))
            self.assertEqual(session.owned['restoreError'],'canceled')

if __name__=='__main__':unittest.main()
