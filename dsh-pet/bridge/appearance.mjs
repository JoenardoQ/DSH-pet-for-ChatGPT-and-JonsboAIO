import {existsSync,readFileSync,mkdirSync,writeFileSync,renameSync} from 'node:fs';
import path from 'node:path';
export const BACKGROUNDS=[{id:'none',label:'关闭背景 · 默认渐变'},
  {id:'starlit-terrace',label:'星空露台'},{id:'afternoon-garden',label:'午后花园'},
  {id:'warm-library',label:'暖光书房'},{id:'sunset-coast',label:'日落海岸'}];
export class Appearance {
  constructor(file){this.file=file;this.background='none';if(existsSync(file))try{this.background=this.valid(JSON.parse(readFileSync(file,'utf8')).background);}catch{}}
  valid(id){if(!BACKGROUNDS.some(b=>b.id===id))throw Error('无效屏幕背景');return id;}
  set(value){if(!value||Object.keys(value).length!==1)throw Error('Expected background');const background=this.valid(value.background);mkdirSync(path.dirname(this.file),{recursive:true});writeFileSync(this.file+'.tmp',JSON.stringify({background}));renameSync(this.file+'.tmp',this.file);this.background=background;return this.snapshot();}
  snapshot(){return {background:this.background};}
}
