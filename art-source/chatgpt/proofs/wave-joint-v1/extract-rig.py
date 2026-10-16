from pathlib import Path
import json, shutil
from PIL import Image
root=Path(__file__).parent
source=root/'rig-atlas.png'
root.mkdir(exist_ok=True); (root/'parts').mkdir(exist_ok=True)
if source.resolve()!=(root/'rig-atlas.png').resolve(): shutil.copy2(source,root/'rig-atlas.png')
image=Image.open(source).convert('RGBA')
regions={'body':(0,0,445,500),'head':(445,0,850,500),'hair':(855,0,1254,495),'wingL':(0,500,435,900),'wingR':(440,495,865,900),'tail':(875,490,1254,906),'upper':(0,903,430,1254),'fore':(440,903,860,1254),'hand':(870,906,1254,1254)}
meta={}
for name,rect in regions.items():
    part=image.crop(rect); bounds=part.getchannel('A').point(lambda a:255 if a>=128 else 0).getbbox()
    if not bounds: raise ValueError(name)
    part=part.crop(bounds); part.save(root/'parts'/(name+'.png'))
    meta[name]={'box':[rect[0]+bounds[0],rect[1]+bounds[1],rect[0]+bounds[2],rect[1]+bounds[3]],'size':list(part.size)}
(root/'parts.json').write_text(json.dumps(meta,indent=2),encoding='utf8')
print(json.dumps(meta))
