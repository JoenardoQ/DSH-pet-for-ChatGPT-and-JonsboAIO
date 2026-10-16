from pathlib import Path
import subprocess,hashlib,json,shutil
r=Path(__file__).resolve().parents[1];extensions={'.png','.jpg','.jpeg','.webp','.gif','.webm','.mp4','.mkv','.svg','.ico','.wav','.mp3','.ttf','.otf','.woff','.woff2'}
def tracked(folder):
 out=subprocess.check_output(['git','-c','core.quotepath=false','-C',str(folder),'ls-files','-z'])
 return [folder/name for name in out.decode('utf8').split('\0') if name and Path(name).suffix.lower() in extensions and (folder/name).is_file()]
def digest(p):return hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
known={digest(p):p for p in tracked(r)};rows=[]
for tag in ['previous-maid','previous-whale']:
 base=r/'.archive'/tag
 for p in tracked(base):
  sha=digest(p);dest=known.get(sha)
  if dest is None:
   dest=r/'art-source/upstream-preserved'/tag/p.relative_to(base);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest);known[sha]=dest
  rows.append({'upstream':tag,'original':p.relative_to(base).as_posix(),'retained':dest.relative_to(r).as_posix(),'sha256':sha,'bytes':p.stat().st_size})
out=r/'art-source/upstream-resource-inventory.json';out.write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
added={x['retained'] for x in rows if x['retained'].startswith('art-source/upstream-preserved/')}
print(json.dumps({'upstreamResourceEntries':len(rows),'newPreservedFiles':len(added),'newPreservedMiB':round(sum((r/p).stat().st_size for p in added)/2**20,2),'originalDeleted':False}))
