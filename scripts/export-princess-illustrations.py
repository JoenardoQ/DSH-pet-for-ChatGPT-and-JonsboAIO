from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json,hashlib
root=Path(__file__).resolve().parents[1]
plan=[('一起吃饭吧',35,96),('Token交给我保管',10,108),('想看见更多',3,126),('我会照顾你的',66,108),('做得很棒',57,120),('压力有点大',53,132),('你好呀',49,102),('吃饱好满足',48,132),('无语凝望',77,144),('拒绝恶意程序',53,168),('这个符号什么意思',76,144),('认真思考中',55,126),('好消息来了',57,168),('惊喜送达',63,120),('不小心删错了',53,72),('就吃一碗',35,156),('理直气壮',77,96),('该更新啦',56,132),('累得灵魂出窍',46,132),('安静睡一会',18,108),('静电小警告',106,108),('替你抱不平',77,48),('认真践行开源',54,108),('陪你轻松聊聊',87,144),('可以分享资源吗',56,168),('这道题有点难',76,180),('元气问候',78,120)]
reports=[];out=root/'dsh-pet/assets/pets/chatgpt/memes';out.mkdir(parents=True,exist_ok=True)
for label,n,index in plan:
 source=root/'dsh-pet/assets/pets/chatgpt/gif'/f'princess-{n:03}.gif'
 if not source.exists():raise FileNotFoundError(source)
 report=json.loads((root/'art-source/chatgpt/keyframes'/f'princess-{n:03}.json').read_text(encoding='utf8'));step=216/report['keyDrawings'];index=min(215,round(round(index/step)*step))
 im=Image.open(source);im.seek(index);frame=im.convert('RGBA');box=frame.getchannel('A').getbbox();assert box
 frame=frame.crop(box);frame.thumbnail((472,472),Image.Resampling.LANCZOS);canvas=Image.new('RGBA',(512,512));canvas.alpha_composite(frame,((512-frame.width)//2,(512-frame.height)//2))
 target=out/(label+'.png');canvas.save(target)
 reports.append({'name':label,'source':source.relative_to(root).as_posix(),'frameIndex':index,'size':[512,512],'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'method':'poster extracted from the matching new dragon-princess action; no blue maid assets'})
assert len(set(r['sha256'] for r in reports))==27
(out.parent/'illustration-generation.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'illustrations':len(reports),'unique':27}),flush=True)
