from pathlib import Path
import json,shutil
from PIL import Image
root=Path(__file__).parent
source=root/'face-atlas.png'
if source.resolve()!=(root/'face-atlas.png').resolve():shutil.copy2(source,root/'face-atlas.png')
old=root.parent/'wave-joint-v1'
if not (root/'parts').exists():shutil.copytree(old/'parts',root/'parts')
meta=json.loads((old/'parts.json').read_text())
atlas=Image.open(source).convert('RGBA')
regions={'head':(0,0,520,550),'openL':(560,260,757,430),'openR':(780,235,995,419),'halfL':(1060,260,1261,427),'halfR':(1285,245,1536,420),'closedL':(50,610,245,776),'closedR':(270,595,487,778),'happyL':(559,620,765,797),'happyR':(778,595,1010,787),'mouthClosed':(1178,643,1393,745),'mouthOpen':(175,865,363,985),'blush':(1070,805,1500,1007)}
for name,rect in regions.items():
    part=atlas.crop(rect);box=part.getchannel('A').point(lambda a:255 if a>=128 else 0).getbbox()
    if not box:raise ValueError(name)
    part.crop(box).save(root/'parts'/(name+'.png'))
    meta[name]={'box':[rect[0]+box[0],rect[1]+box[1],rect[0]+box[2],rect[1]+box[3]],'size':[box[2]-box[0],box[3]-box[1]]}
(root/'parts.json').write_text(json.dumps(meta,indent=2),encoding='utf8')
print(json.dumps({key:meta[key] for key in regions}))
