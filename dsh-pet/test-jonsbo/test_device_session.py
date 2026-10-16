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

if __name__=='__main__':unittest.main()
