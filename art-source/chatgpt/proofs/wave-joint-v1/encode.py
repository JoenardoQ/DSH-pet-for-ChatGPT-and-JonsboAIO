from pathlib import Path
from PIL import Image, ImageDraw
import hashlib,json
root=Path(__file__).parent
atlas=Image.open(root/'rig-atlas.png').convert('RGBA')
palette_source=Image.new('RGB',atlas.size,'white'); palette_source.paste(atlas,mask=atlas.getchannel('A').point(lambda a:255 if a>=128 else 0))
palette=palette_source.quantize(colors=255)
frames=[];previews=[]
for n,file in enumerate(sorted((root/'frames').glob('*.png'))):
    rgba=Image.open(file).convert('RGBA').resize((640,480),Image.Resampling.LANCZOS)
    mask=rgba.getchannel('A').point(lambda a:255 if a>=128 else 0)
    rgb=Image.new('RGB',rgba.size,'white');rgb.paste(rgba,mask=mask)
    frame=rgb.quantize(palette=palette,dither=Image.Dither.NONE)
    frame.paste(255,mask=mask.point(lambda a:255-a));frames.append(frame)
    if n in (0,48,84,108,132,192):
        dark=Image.new('RGB',rgba.size,(32,31,39));dark.paste(rgba,mask=mask);previews.append((n,dark))
durations=[round((i+1)*100/24)*10-round(i*100/24)*10 for i in range(216)]
target=root/'wave-joint-proof.gif'
frames[0].save(target,save_all=True,append_images=frames[1:],duration=durations,loop=0,disposal=2,transparency=255,optimize=False)
out=Image.open(target);hashes=[];duration=0
for n in range(out.n_frames):
    out.seek(n);hashes.append(hashlib.sha256(out.convert('RGBA').tobytes()).hexdigest());duration+=out.info['duration']
sheet=Image.new('RGB',(1280,3*510),(32,31,39));draw=ImageDraw.Draw(sheet)
for i,(n,frame) in enumerate(previews):
    x=i%2*640;y=i//2*510;sheet.paste(frame,(x,y+30));draw.text((x+18,y+10),str(n/24)+' s',fill='white')
sheet.save(root/'contact-sheet.png')
report={'status':'proof-not-approved','frames':out.n_frames,'distinctPixelFrames':len(set(hashes)),'durationMs':duration,'bytes':target.stat().st_size,'method':'fixed imagegen parts atlas, continuous shoulder/elbow/wrist rotations; no optical-flow, crossfade or pose replacement','limitations':['rig attachment quality and motion must be judged in playback','fixed facial expression; this is not the complete expressive animation set']}
(root/'encoding.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report))
