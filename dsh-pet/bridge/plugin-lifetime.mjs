import { readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
// Local Codex marketplace switches are persisted here by the host.
export function pluginEnabled(file = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'config.toml')) {
  try {
    const text = readFileSync(file, 'utf8');
    const section = text.match(/^\[plugins\.["']pet-trio-jonsbo@pet-trio-jonsbo["']\]\s*\r?\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m);
    if (!section) return undefined;
    const enabled = section[1].match(/^enabled\s*=\s*(true|false)\s*(?:#.*)?$/m);
    return enabled ? enabled[1] === 'true' : undefined;
  } catch { return undefined; }
}
export class HostLeases {
  constructor(readSwitch = pluginEnabled, now = Date.now) {
    this.readSwitch = readSwitch; this.now = now; this.hosts = new Map(); this.hadHost = false;
  }
  update(id, release = false) {
    this.hadHost = true;
    const flag = this.readSwitch();
    if (flag === false) { this.hosts.clear(); return false; }
    const existing = this.hosts.get(id);
    if (release) { if (!existing?.managed) this.hosts.delete(id); return true; }
    this.hosts.set(id, { managed: existing?.managed || flag === true, at: this.now() });
    return true;
  }
  active() {
    const flag = this.readSwitch();
    for (const [id, host] of this.hosts) {
      if (host.managed ? flag !== true : this.now() - host.at > 10000) this.hosts.delete(id);
    }
    return this.hosts.size > 0;
  }
}
