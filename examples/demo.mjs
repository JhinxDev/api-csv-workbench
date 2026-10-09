import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(mkdtempSync(join(tmpdir(), 'api-csv-demo-')), 'export');
const result = execFileSync(process.execPath, [join(root, 'src/cli.mjs'), 'demo', '--out', out, '--json'], { cwd: tmpdir(), encoding: 'utf8' });
process.stdout.write(result);
