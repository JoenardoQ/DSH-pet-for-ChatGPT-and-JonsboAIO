import os
from pathlib import Path
import subprocess
import sys
import unittest
import uuid
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'desktop'))
from screen_lease import ScreenLease, available

@unittest.skipUnless(os.name == 'nt', 'Windows kernel mutex')
class ScreenLeaseTests(unittest.TestCase):
    def test_two_processes_exclude_and_recover_after_owner_crash(self):
        name = r'Local\JonsboTest-' + uuid.uuid4().hex
        old = os.environ.get('JONSBO_SCREEN_LOCK_NAME')
        os.environ['JONSBO_SCREEN_LOCK_NAME'] = name
        directory = str(Path(__file__).resolve().parents[1] / 'desktop')
        code = 'import sys;sys.path.insert(0,sys.argv[1]);from screen_lease import ScreenLease;l=ScreenLease();assert l.acquire();print("held",flush=True);sys.stdin.read()'
        child = subprocess.Popen([sys.executable, '-c', code, directory], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        try:
            self.assertEqual(child.stdout.readline().strip(), 'held')
            self.assertFalse(available(), 'another process must not touch the SDK')
            child.kill()
            child.wait(timeout=5)
            with ScreenLease():
                self.assertFalse(available(), 'same-thread reentry must not open a second display')
            self.assertTrue(available())
        finally:
            if child.poll() is None:
                child.kill()
            child.wait(timeout=5)
            child.stdin.close()
            child.stdout.close()
            if old is None:
                os.environ.pop('JONSBO_SCREEN_LOCK_NAME', None)
            else:
                os.environ['JONSBO_SCREEN_LOCK_NAME'] = old

if __name__ == '__main__':
    unittest.main()
