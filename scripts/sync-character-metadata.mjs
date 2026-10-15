// One authoritative persona module; derived JSON is kept for asset consumers.
import fs from 'node:fs';import vm from 'node:vm';
const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(new URL('../dsh-pet/runtime/electron-helper/shared-core.js',import.meta.url),'utf8'),ctx);
const S=ctx.PetShared;
for(const [file,value] of [['personas.json',S.CHARACTER_PERSONAS],['dialogue-catalog.json',S.DIALOGUE_IMAGES]]){
 fs.writeFileSync(new URL('../dsh-pet/assets/pets/'+file,import.meta.url),JSON.stringify(value,null,2)+'\n');
}
