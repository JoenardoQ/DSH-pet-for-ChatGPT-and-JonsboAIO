"""Bundle already-built Windows runtimes for Git installation; each part stays below GitHub's limit."""
import argparse, hashlib, json, tempfile, zipfile
from pathlib import Path
parser=argparse.ArgumentParser()
parser.add_argument('--package',type=Path,required=True)
parser.add_argument('--electron',type=Path,required=True)
parser.add_argument('--dependencies',type=Path,required=True)
args=parser.parse_args()
runtime=args.package/'runtime';runtime.mkdir(exist_ok=True)
def archive(directory, target, prefix=''):
    with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for f in sorted(directory.rglob('*')):
            if f.is_file() and '.bin' not in f.relative_to(directory).parts:
                z.write(f,prefix+f.relative_to(directory).as_posix())
deps=runtime/'dependencies.zip'
archive(args.dependencies,deps,'node_modules/')
with tempfile.TemporaryDirectory(prefix='dsh-pet-runtime-') as tmp:
    zipped=Path(tmp)/'electron.zip';archive(args.electron,zipped)
    digest=hashlib.sha256();parts=[]
    with zipped.open('rb') as f:
        while chunk:=f.read(64*1024*1024):
            name=f'electron-win-x64.zip.{len(parts)+1:03d}'
            (runtime/name).write_bytes(chunk);digest.update(chunk);parts.append(name)
meta={'platform':'win32-x64','node':'24.19.0','electron':{'version':'43.3.0','parts':parts,'sha256':digest.hexdigest()},'dependencies':{'file':deps.name,'sha256':hashlib.sha256(deps.read_bytes()).hexdigest()}}
(runtime/'windows-bundle.json').write_text(json.dumps(meta,indent=2)+'\n',encoding='utf-8')
print(json.dumps(meta,indent=2))
