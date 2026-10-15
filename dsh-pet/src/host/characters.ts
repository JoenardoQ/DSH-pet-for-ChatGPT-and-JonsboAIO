import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { CHARACTERS, characterLabel, type CharacterId } from '../shared/characters';
export class CharacterStore {
  declare private values: Record<string, CharacterId>;
  declare private file: string;
  constructor(file: string) {
    this.file = file;
    this.values = Object.create(null);
    if (existsSync(file)) {
      try {
        const saved = JSON.parse(readFileSync(file, 'utf8'));
        for (const [key, id] of Object.entries(saved))
          if (CHARACTERS.some((c) => c.id === id)) this.values[key] = id as CharacterId;
      } catch {}
    }
  }
  get(petId: string): CharacterId {
    return Object.prototype.hasOwnProperty.call(this.values, petId) ? this.values[petId] : 'fish';
  }
  set(petId: string, id: unknown): CharacterId {
    if (!petId || !CHARACTERS.some((c) => c.id === id)) throw Error('无效桌宠或角色');
    const next = { ...this.values, [petId]: id as CharacterId };
    mkdirSync(dirname(this.file), { recursive: true });
    const temp = this.file + '.' + process.pid + '.tmp';
    writeFileSync(temp, JSON.stringify(next, null, 2));
    renameSync(temp, this.file);
    this.values = next;
    return id as CharacterId;
  }
  decorate(cfg: Record<string, Record<string, unknown>>): Record<string, Record<string, unknown>> {
    return Object.fromEntries(
      Object.entries(cfg).map(([entry, conf]) => [
        entry,
        {
          ...conf,
          pets: (Array.isArray(conf.pets) ? conf.pets : []).map((p: Record<string, unknown>) => {
            const id = this.get(String(p.id));
            const legacy = p.id === 'main' && p.name === '蓝毛小女仆';
            return {
              ...p,
              character: id,
              name: id !== 'fish' || legacy ? characterLabel(id) : p.name,
              display: legacy && p.display === 'both' ? 'desktop' : p.display,
            };
          }),
        },
      ]),
    );
  }
}
