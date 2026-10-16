import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { nextSizePercent, type SizeAction } from '../shared/size';
export class PetSizeStore {
  declare private file: string;
  declare private values: Record<string, number>;
  constructor(file: string) {
    this.file = file; this.values = Object.create(null) as Record<string, number>;
    if (existsSync(file)) try {
      for (const [id, value] of Object.entries(JSON.parse(readFileSync(file, 'utf8'))))
        if (typeof value === 'number' && Number.isInteger(value) && value >= 50 && value <= 200) this.values[id] = value;
    } catch { /* Invalid preferences must not prevent startup. */ }
  }
  set(id: string, action: SizeAction): number {
    const percent = nextSizePercent(this.values[id] ?? 100, action);
    const next = { ...this.values, [id]: percent };
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file + '.tmp', JSON.stringify(next)); renameSync(this.file + '.tmp', this.file);
    this.values = next; return percent;
  }
  decorate(cfg: Record<string, Record<string, unknown>>): Record<string, Record<string, unknown>> {
    return Object.fromEntries(Object.entries(cfg).map(([id, entry]) => [id, { ...entry,
      pets: (Array.isArray(entry.pets) ? entry.pets : []).map((p: Record<string, unknown>) => {
        const sizePercent = this.values[String(p.id)] ?? 100;
        return { ...p, sizePercent, size: Math.max(160, Math.min(1280, Math.round(Number(p.size) * sizePercent / 100))) };
      }),
    }]));
  }
}
