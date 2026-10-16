"""Build a real 24fps transparent GIF from generated articulated key drawings.
No duplicated-frame padding. Global extraction keeps complete bodies and scale.
Requires Pillow/numpy and an existing FFmpeg with minterpolate; authoring only.
"""
from pathlib import Path
import json,sys,subprocess,hashlib,shutil,os,atexit
import numpy as np
from PIL import Image,ImageFilter
root=Path(__file__).resolve().parents[1]
item=json.loads(Path(sys.argv[1]).read_text(encoding='utf8'))
finished=False
exit_file=root/'.qa'/(item['id']+'.exit');exit_file.parent.mkdir(parents=True,exist_ok=True);exit_file.unlink(missing_ok=True)
atexit.register(lambda:exit_file.write_text('0' if finished else '1',encoding='ascii'))
ffmpeg=sys.argv[2]
source=Path(item['source'])
if not source.is_absolute():source=root/source
im=Image.open(source).convert('RGBA')
if item.get('contentBounds'):im=im.crop(tuple(item['contentBounds']))
w,h=im.size;columns,rows=item.get('keyframeGrid',[4,4])
row_sizes=item.get('rowColumns',[columns]*rows);key_count=sum(row_sizes)
row_bounds=item.get('rowBounds',[[round(r*h/rows),round((r+1)*h/rows)] for r in range(rows)])
def cell_at(x,y):
 row=next((r for r,(_,bottom) in enumerate(row_bounds) if y<bottom),rows-1)
 return row,min(row_sizes[row]-1,int(x*row_sizes[row]/w))
alpha=np.asarray(im.getchannel('A'))
barriers=list(item.get('componentBarriers',[]))
column_barriers=item.get('columnBarriers',[])
def connected():
 active=bytearray((alpha>=128).ravel());found=[]
 for start in range(w*h):
  if not active[start]:continue
  stack=[start];active[start]=0;points=[]
  while stack:
   p=stack.pop();points.append(p);x=p%w;y=p//w
   for n in ([p-1] if x else [])+([p+1] if x<w-1 else [])+([p-w] if y else [])+([p+w] if y<h-1 else []):
    if abs(n-p)==w and any(x>=b[1] and x<b[2] and min(y,n//w)<b[0]<=max(y,n//w) for b in barriers):continue
    if abs(n-p)==1 and any(y>=b[1] and y<b[2] and min(x,n%w)<b[0]<=max(x,n%w) for b in column_barriers):continue
    if active[n]:active[n]=0;stack.append(n)
  if len(points)>=20:
   p=np.asarray(points);xs=p%w;ys=p//w
   found.append({'points':p,'count':len(p),'box':(int(xs.min()),int(ys.min()),int(xs.max())+1,int(ys.max())+1),'center':(float(xs.mean()),float(ys.mean()))})
 return found
components=connected()
# Some generated rows merely touch. Split the graph at their shared border;
# do not erase, resize or invent any pixels in either drawing.
median=float(np.median(sorted([c['count'] for c in components],reverse=True)[:16]))
for c in components:
 if c['count']<median*1.6:continue
 x0,y0,x1,y1=c['box']
 if y1-y0>h/rows*1.4:
  for line in range(1,rows):
   y=round(line*h/rows)
   if y0+10<y<y1-10 and [y,x0,x1] not in barriers:barriers.append([y,x0,x1])
if barriers!=item.get('componentBarriers',[]):components=connected()
primary={}
for c in sorted(components,key=lambda c:c['count'],reverse=True):
 x,y=c['center'];cell=cell_at(x,y)
 if cell not in primary and c['count']>=1200:primary[cell]=c
if not item.get('rowColumns') and item.get('role','chatgpt')=='chatgpt':
 candidates=[c for c in components if c['count']>=max(1200,median*.35) and c['box'][3]-c['box'][1]>=h*.1]
 def cluster(values,axis,threshold):
  result=[]
  for c in sorted(values,key=lambda c:c['center'][axis]):
   if not result or c['center'][axis]-result[-1][-1]['center'][axis]>threshold:result.append([])
   result[-1].append(c)
  return result
 inferred=cluster(candidates,1,h/8)
 if 8<=len(candidates)<=36 and 2<=len(inferred)<=6 and len({len(row) for row in inferred})==1:
  rows=len(inferred);columns=len(inferred[0]);key_count=rows*columns;row_sizes=[columns]*rows
  primary={(row,col):c for row,values in enumerate(inferred) for col,c in enumerate(sorted(values,key=lambda c:c['center'][0]))}
 if len(primary)!=key_count:raise ValueError(f'{item["id"]}: expected {key_count} complete character clusters, found {len(primary)}')
if len(primary)!=key_count:raise ValueError(f'{item["id"]}: incomplete source cells {len(primary)}/{key_count}')
item['keyframeGrid']=[columns,rows];item['componentBarriers']=barriers
if '--inspect' in sys.argv:
 finished=True;print(json.dumps({'id':item['id'],'keyDrawings':key_count,'grid':[columns,rows],'rowColumns':row_sizes}),flush=True);raise SystemExit
groups={key:[value] for key,value in primary.items()};selected={id(c) for c in primary.values()}
def distance(c,p):
 x,y=c['center'];a,b,d,e=p['box'];dx=max(a-x,0,x-d);dy=max(b-y,0,y-e)
 return (dx*dx+dy*dy, (x-p['center'][0])**2+(y-p['center'][1])**2)
for c in components:
 if id(c) not in selected:
  key=cell_at(*c['center']) if item.get('role')=='duo' else min(primary,key=lambda k:distance(c,primary[k]))
  groups[key].append(c)
frames=[];geometry=[]
baselines={row:float(np.median([primary[(row,col)]['box'][3] for col in range(row_sizes[row])])) for row in range(rows)}
for (row,col),group in sorted(groups.items()):
 mask=np.zeros((h*w,),dtype=np.uint8)
 for c in group:mask[c['points']]=255
 mask=Image.fromarray(mask.reshape(h,w)).filter(ImageFilter.MaxFilter(3))
 frame=im.copy();frame.putalpha(Image.fromarray(np.minimum(np.asarray(mask),alpha)))
 box=frame.getbbox();assert box
 # Whole-frame alpha and props are assigned before cropping; no neighbouring feet.
 frames.append((frame.crop(box),box,row,col));geometry.append((box[0]-(col+.5)*w/row_sizes[row],box[1]-baselines[row],box[2]-(col+.5)*w/row_sizes[row],box[3]-baselines[row]))
left=min(b[0] for b in geometry);right=max(b[2] for b in geometry)
top=min(b[1] for b in geometry);bottom=max(b[3] for b in geometry)
scale=min(584/(right-left),324/(bottom-top));center=(left+right)/2
stage=root/'.qa/motion-export'/item['id'];stage.mkdir(parents=True,exist_ok=True)
keyframes=[]
for n,(frame,box,row,col) in enumerate(frames):
 frame=frame.resize((max(1,round(frame.width*scale)),max(1,round(frame.height*scale))),Image.Resampling.LANCZOS)
 canvas=Image.new('RGBA',(640,360));x=round(320+(box[0]-(col+.5)*w/row_sizes[row]-center)*scale);y=round(18+(box[1]-baselines[row]-top)*scale)
 canvas.alpha_composite(frame,(x,y));bounds=canvas.getchannel('A').getbbox();assert bounds and bounds[0]>=0 and bounds[1]>=0 and bounds[2]<=640 and bounds[3]<=360
 keyframes.append(canvas)
pixels=np.asarray(im).astype(np.int16);opaque=pixels[:,:,3]>=128
matte=None
for margin in (45,80,120):
 for color in [(0,255,0),(255,0,255),(0,255,255),(255,255,0),(255,0,0),(0,0,255)]:
  high=[i for i,c in enumerate(color) if c];low=[i for i,c in enumerate(color) if not c]
  hit=(pixels[:,:,high].min(axis=2)>pixels[:,:,low].max(axis=2)+margin)&(pixels[:,:,high].min(axis=2)>120)
  if not np.any(hit&opaque):matte=(color,high,low,margin);break
 if matte:break
if matte is None:raise ValueError('No safe matte colour: keep artwork for an alpha-aware repair')
color,high,low,margin=matte;item['matteColorRGB']=list(color);item['matteMargin']=margin
for n in range(key_count+3):
 canvas=Image.new('RGB',(640,360),color);canvas.paste(keyframes[n%key_count],mask=keyframes[n%key_count].getchannel('A'));canvas.save(stage/f'key-{n:03d}.png')
args=[ffmpeg,'-hide_banner','-loglevel','error','-y','-threads','2','-filter_threads','1','-framerate',str(key_count)+'/9','-i',str(stage/'key-%03d.png'),'-vf','minterpolate=fps=24:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,format=rgb24','-frames:v','216',str(stage/'frame-%03d.png')]
subprocess.run(args,check=True,timeout=600,creationflags=0x08000000 if os.name=='nt' else 0)
decoded=[]
for n in range(1,217):
 f=Image.open(stage/f'frame-{n:03d}.png').convert('RGB');arr=np.asarray(f).astype(np.int16)
 background=(arr[:,:,high].min(axis=2)>arr[:,:,low].max(axis=2)+margin)&(arr[:,:,high].min(axis=2)>120)
 rgba=f.convert('RGBA');rgba.putalpha(Image.fromarray(np.where(background,0,255).astype(np.uint8)));decoded.append(rgba)
# Quantize against actual artwork colours, never interpolated matte spill.
sample=Image.new('RGB',im.size,(255,255,255))
sample.paste(im,mask=im.getchannel('A').point(lambda a:255 if a>=128 else 0))
palette=sample.quantize(colors=255);encoded=[]
for f in decoded:
 rgb=Image.new('RGB',f.size,(255,255,255));rgb.paste(f,mask=f.getchannel('A'));q=rgb.quantize(palette=palette,dither=Image.Dither.FLOYDSTEINBERG);q.paste(255,mask=f.getchannel('A').point(lambda a:255 if a<128 else 0));encoded.append(q)
durations=[round((n+1)*1000/24/10)*10-round(n*1000/24/10)*10 for n in range(216)]
role=item.get('role','chatgpt');assert role in ('chatgpt','duo')
target=root/'dsh-pet/assets/pets'/role/'gif'/(item['id']+'.gif')
target.parent.mkdir(parents=True,exist_ok=True)
encoded[0].save(target,save_all=True,append_images=encoded[1:],duration=durations,loop=0,disposal=2,transparency=255,optimize=False)
check=Image.open(target);total=0;hashes=[]
for n in range(check.n_frames):check.seek(n);total+=check.info['duration'];hashes.append(hashlib.sha256(check.convert('RGBA').tobytes()).hexdigest())
if check.n_frames<200 or len(set(hashes))<190 or not 8000<=total<=10000:raise ValueError((item['id'],check.n_frames,len(set(hashes)),total))
art=root/'art-source'/role/'keyframes';art.mkdir(parents=True,exist_ok=True);saved=art/(item['id']+'.png')
if source.resolve()!=saved.resolve():shutil.copy2(source,saved)
item['paletteSource']='opaque pixels of the original key drawings; excludes matte spill'
report={**item,'file':str(target.relative_to(root)).replace('\\','/'),'source':str(saved.relative_to(root)).replace('\\','/'),'status':'exported','keyDrawings':key_count,'frames':check.n_frames,'uniqueFrames':len(set(hashes)),'durationMs':total,'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'method':'imagegen articulated key drawings; FFmpeg motion-compensated interpolation to 24fps; transparent GIF encoding'}
(art/(item['id']+'.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
decoded[0].save(stage/'preview.png');finished=True;print(json.dumps(report,ensure_ascii=False),flush=True)
