"""Mechanical 4x4 sprite slicing and GIF encoding, no synthetic bob/zoom motion.
The built-in image generator supplies the articulated artwork in each frame.
"""
from PIL import Image, ImageChops, ImageStat
from pathlib import Path
import json, hashlib, sys, shutil
root=Path(__file__).resolve().parents[1]
if len(sys.argv)<3: raise SystemExit('usage: export-gif-atlases.py MANIFEST ROLE')
items=json.loads(Path(sys.argv[1]).read_text(encoding='utf8'))
role=sys.argv[2]; out=root/'dsh-pet/assets/pets'/role/'gif';out.mkdir(parents=True,exist_ok=True)
sources=root/'art-source'/role;sources.mkdir(parents=True,exist_ok=True)
report=[]
for item in items:
 source=Path(item['source']);name=item['id'];sheet=Image.open(source).convert('RGBA')
 if source.resolve() != (sources/(name+'.png')).resolve(): shutil.copy2(source,sources/(name+'.png'))
 frames=[]
 columns, rows=item.get('grid',[4,4])
 row_bounds=item.get('rowBounds',[[round(row*sheet.height/rows),round((row+1)*sheet.height/rows)] for row in range(rows)])
 for top,bottom in row_bounds:
  for col in range(columns):
   tile=sheet.crop((round(col*sheet.width/columns),top,round((col+1)*sheet.width/columns),bottom))
   # Explicit extraction masks remove neighbouring-cell fragments, never rescale the character.
   for box in item.get('tileMasks',{}).get(str(len(frames)),[]):tile.paste((0,0,0,0),tuple(box))
   # Constant cell geometry for every frame; never independently auto-crop/scale
   # characters, which would introduce camera jitter.
   scale=min(584/tile.width,336/tile.height)
   tile=tile.resize((round(tile.width*scale),round(tile.height*scale)),Image.Resampling.LANCZOS)
   canvas=Image.new('RGBA',(640,360));canvas.alpha_composite(tile,((640-tile.width)//2,348-tile.height));frames.append(canvas)
 # One shared palette across the loop, index 255 reserved for transparency.
 palette_sheet=Image.new('RGB',(640,360*len(frames)),(255,255,255))
 for i,f in enumerate(frames):palette_sheet.paste(f,(0,i*360),f.getchannel('A'))
 palette=palette_sheet.quantize(colors=255)
 encoded=[]
 for f in frames:
  rgb=Image.new('RGB',f.size,(255,255,255));rgb.paste(f,mask=f.getchannel('A'))
  q=rgb.quantize(palette=palette,dither=Image.Dither.FLOYDSTEINBERG)
  q.paste(255,mask=f.getchannel('A').point(lambda a:255 if a<128 else 0))
  q.info['transparency']=255;encoded.append(q)
 target=out/(name+'.gif')
 encoded[0].save(target,save_all=True,append_images=encoded[1:],duration=300,loop=0,disposal=2,transparency=255,optimize=False)
 check=Image.open(target);assert check.n_frames==columns*rows,(name,check.n_frames)
 hashes=[]
 for i in range(check.n_frames):check.seek(i);hashes.append(hashlib.sha256(check.convert('RGBA').tobytes()).hexdigest())
 assert len(set(hashes))>=12,(name,'not enough different articulated frames')
 report.append({'id':name,'file':str(target.relative_to(root)).replace('\\','/'),'frames':check.n_frames,'uniqueFrames':len(set(hashes)),'durationMs':300*check.n_frames,'grid':[columns,rows],'rowBounds':row_bounds,'tileMasks':item.get('tileMasks',{}),'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'prompt':item['prompt'],'source':str((sources/(name+'.png')).relative_to(root)).replace('\\','/'),'mode':'built-in image_gen; mechanical sprite-sheet to GIF export'})
 (sources/(name+'.json')).write_text(json.dumps(report[-1],ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 print(name,check.n_frames,len(set(hashes)),target.stat().st_size)
metadata=out.parent/'animation-generation.json'
previous=json.loads(metadata.read_text(encoding='utf8')) if metadata.exists() else []
merged={item['id']:item for item in previous}
merged.update({item['id']:item for item in report})
metadata.write_text(json.dumps(list(merged.values()),ensure_ascii=False,indent=2)+'\n',encoding='utf8')
