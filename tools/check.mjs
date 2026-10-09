import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
function scan(p) { return readdirSync(p, { withFileTypes: true }).flatMap(e => e.isDirectory() ? scan(join(p,e.name)) : e.name.endsWith('.mjs') ? [join(p,e.name)] : []); }
for (const f of ['src','test','examples','tools'].flatMap(scan)) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) { process.stderr.write(r.stderr); process.exit(1); }
}
process.stdout.write('All JavaScript syntax checks passed.\n');
