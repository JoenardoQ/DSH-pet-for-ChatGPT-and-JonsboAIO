import base64
import io
from pathlib import Path
import sys
import unittest
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'desktop'))
from frame_worker import decode_frame

class FrameTests(unittest.TestCase):
    def encoded(self,size=(480,480)):
        im=Image.new('RGB',size,'blue')
        im.putpixel((0,0),(255,0,0))
        out=io.BytesIO();im.save(out,format='PNG')
        return base64.b64encode(out.getvalue()).decode()

    def test_rotation_preserves_pixels(self):
        frame=decode_frame(self.encoded(),rotation=90)
        self.assertEqual(frame.getpixel((479,0)),(255,0,0))
        self.assertEqual(frame.size,(480,480))

    def test_runtime_defaults_to_clockwise_90(self):
        source=(Path(__file__).resolve().parents[1]/'desktop'/'frame_worker.py').read_text(encoding='utf-8')
        self.assertIn("config.get('rotation', 90)",source)

    def test_reject_wrong_dimensions(self):
        with self.assertRaises(ValueError):decode_frame(self.encoded((100,100)))

    def test_reject_malformed(self):
        with self.assertRaises(Exception):decode_frame('not a png')

if __name__=='__main__':unittest.main()
