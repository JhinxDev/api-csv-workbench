#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { makePlan } from './plan.mjs';
import { run } from './engine.mjs';
import { openStore, exportRun } from './store.mjs';
import { envelope, fail } from './errors.mjs';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const help = `api-csv 0.1.0: a bounded local API-to-CSV workbench (Node 24.15+)
Usage: api-csv <command> [options] [--json]
  doctor   Show runtime, auth presence and offline input availability; no network
  plan     Validate editable CSV inputs and preview exact expanded queries
  run      Start a bounded batch in a new SQLite database
  resume   Continue the same inputs, provider and limits; --recover-lock after crash
  status   Read committed state from --db
  export   Write committed rows and completeness summary to a NEW --out directory
  demo     Run bundled synthetic inputs and export to a NEW --out directory
Options:
  --locations FILE    Headers: location_id,location
  --footprints FILE   Headers: footprint_id,template; template includes {location}
  --provider NAME     fixture (default), publicwww, local-http
  --local-url ORIGIN  Test-only numeric loopback HTTP origin; never receives real key
  --page-size N       Default 2, maximum 1000
  --max-pages N       Default 5 per query, maximum 1000
  --max-requests N    Default 100 across attempts, account checks and retries
  --max-queries N     Default 100, maximum 1000
  --db FILE           Required for run/resume/status/export
  --out DIRECTORY     Required for export/demo; directory must not already exist
  --recover-lock      Resume only: verify process ended and remove stale run lock
  --json              Stable success/error envelope; JSON only on stdout
Live auth: PUBLICWWW_API_KEY environment variable only. Live origin is fixed.
Nonzero result: 1 failed operation, 2 partial run/export. See README for limits.
Launch without global installation: api-csv.cmd ... (Windows) or node src/cli.mjs ...
`;
const flags = new Set(['json','recover-lock','help']);
const values = new Set(['locations','footprints','provider','local-url','page-size','max-pages','max-requests','max-queries','db','out']);
function parse(args) {
  const opts = {}; let command;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) { const name = a.slice(2);
      if (Object.hasOwn(opts, name)) fail('INVALID_ARGUMENT', 'Duplicate option.');
      if (flags.has(name)) opts[name] = true;
      else if (values.has(name) && args[i + 1] && !args[i + 1].startsWith('--')) opts[name] = args[++i];
      else fail('INVALID_ARGUMENT', 'Unknown option or missing option value.');
    } else if (!command) command = a;
    else fail('INVALID_ARGUMENT', 'Unexpected positional argument.');
  }
  return { command, opts };
}
const required = (opts, name) => opts[name] || fail('INVALID_ARGUMENT', `Required option: ${name}.`);
function planFrom(opts, demo = false) {
  const numeric = (key, fallback) => opts[key] === undefined ? fallback : Number(opts[key]);
  return makePlan({ locations: demo ? join(root, 'fixtures/locations.csv') : required(opts, 'locations'),
    footprints: demo ? join(root, 'fixtures/footprints.csv') : required(opts, 'footprints'),
    provider: demo ? 'fixture' : opts.provider ?? 'fixture', pageSize: numeric('page-size', 2),
    maxPages: numeric('max-pages', 5), maxRequests: numeric('max-requests', 100), maxQueries: numeric('max-queries', 100) });
}
function checkOptions(command, opts) {
  const allowed = {
    doctor: ['json'], plan: ['json','locations','footprints','provider','page-size','max-pages','max-requests','max-queries'],
    run: ['json','locations','footprints','provider','page-size','max-pages','max-requests','max-queries','db','local-url'],
    resume: ['json','locations','footprints','provider','page-size','max-pages','max-requests','max-queries','db','local-url','recover-lock'],
    status: ['json','db'], export: ['json','db','out'], demo: ['json','out']
  }[command];
  if (!allowed) fail('INVALID_ARGUMENT', 'Unknown command. Use --help.');
  if (Object.keys(opts).some(k => !allowed.includes(k))) fail('INVALID_ARGUMENT', 'Option is not available for this command.');
  if (opts['local-url'] && opts.provider !== 'local-http') fail('INVALID_ARGUMENT', 'A local URL is only valid in local-http mode.');
}
async function main() {
  const { command, opts } = parse(process.argv.slice(2));
  if (opts.help || !command) { process.stdout.write(help); return; }
  checkOptions(command, opts); let result;
  if (command === 'doctor') {
    result = { version: '0.1.0', runtime: process.version, runtimeSupported: Number(process.versions.node.split('.')[0]) === 24 && Number(process.versions.node.split('.')[1]) >= 15,
      fixtureAvailable: existsSync(join(root, 'fixtures/locations.csv')), offlineAuthRequired: false,
      liveAuthAvailable: Boolean(process.env.PUBLICWWW_API_KEY), liveAuthSource: process.env.PUBLICWWW_API_KEY ? 'env' : 'missing',
      liveVerification: 'Not performed. Paid account and client queries required.' };
  } else if (command === 'plan') result = planFrom(opts);
  else if (command === 'run' || command === 'resume') {
    result = await run(planFrom(opts), { db: required(opts, 'db'), resume: command === 'resume', recover: Boolean(opts['recover-lock']), localUrl: opts['local-url'] });
  } else if (command === 'status' || command === 'export') {
    const db = required(opts, 'db'); if (!existsSync(db)) fail('RUN_NOT_FOUND', 'Run database does not exist.');
    const s = openStore(db); try { result = command === 'status' ? s.summary() : exportRun(s, required(opts, 'out')); } finally { s.close(); }
  } else if (command === 'demo') {
    const out = resolve(required(opts, 'out')); if (existsSync(out)) fail('EXPORT_EXISTS', 'Demo directory already exists.');
    const summary = await run(planFrom(opts, true), { db: out + '.sqlite' });
    const s = openStore(out + '.sqlite'); try { result = { ...exportRun(s, out), summary }; } finally { s.close(); }
  }
  process.stdout.write(JSON.stringify({ ok: true, result }, null, opts.json ? undefined : 2) + '\n');
  const state = result?.summary?.state ?? result?.state;
  if (state === 'partial' || command === 'export' && ['pending','running'].includes(state)) process.exitCode = 2;
  else if (state === 'failed') process.exitCode = 1;
}
main().catch(error => { process.stdout.write(JSON.stringify(envelope(error)) + '\n'); process.exitCode = 1; });
