import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, openSync, closeSync, unlinkSync, writeFileSync, renameSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { csvText } from './csv.mjs';
import { fail } from './errors.mjs';
export function openStore(file, plan) {
  mkdirSync(dirname(resolve(file)), { recursive: true });
  const db = new DatabaseSync(file, { timeout: 1000 });
  db.exec(`PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS queries(id TEXT PRIMARY KEY, info TEXT NOT NULL, next_page INTEGER NOT NULL DEFAULT 1, state TEXT NOT NULL DEFAULT 'pending', reason TEXT);
    CREATE TABLE IF NOT EXISTS domains(domain TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS matches(domain TEXT NOT NULL REFERENCES domains, query_id TEXT NOT NULL REFERENCES queries, url TEXT NOT NULL, rank INTEGER, ranked INTEGER NOT NULL, PRIMARY KEY(domain,query_id,url));`);
  const get = key => { const r = db.prepare('SELECT value FROM meta WHERE key=?').get(key); return r ? JSON.parse(r.value) : undefined; };
  const set = (key, value) => db.prepare('INSERT INTO meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value));
  if (plan) {
    const old = get('plan');
    if (old && old.fingerprint !== plan.fingerprint) { db.close(); fail('RESUME_MISMATCH', 'Inputs, provider or limits changed. Use a separate run database.'); }
    if (!old) { db.exec('BEGIN IMMEDIATE'); try { set('plan', plan); set('requests', 0); set('state', 'pending');
      for (const q of plan.queries) db.prepare('INSERT INTO queries(id,info) VALUES(?,?)').run(q.id, JSON.stringify(q)); db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); db.close(); throw e; } }
  }
  if (!get('plan')) { db.close(); fail('RUN_NOT_FOUND', 'No initialized run in this database.'); }
  function summary() {
    const p = get('plan'); const states = db.prepare('SELECT state,COUNT(*) AS n FROM queries GROUP BY state').all();
    return { schema: 1, provider: p.provider, fingerprint: p.fingerprint, state: get('state'), reason: get('reason') ?? null,
      requests: get('requests'), maxRequests: p.maxRequests, queryCount: p.queries.length,
      accountLimits: get('accountLimits') ?? null,
      queryStates: Object.fromEntries(states.map(r => [r.state, r.n])),
      queryOutcomes: db.prepare('SELECT id,info,next_page,state,reason FROM queries ORDER BY id').all().map(r => {
        const q = JSON.parse(r.info); return { queryId: r.id, locationId: q.location_id, footprintId: q.footprint_id, nextPage: r.next_page, state: r.state, reason: r.reason };
      }),
      domains: db.prepare('SELECT COUNT(*) AS n FROM domains').get().n, matches: db.prepare('SELECT COUNT(*) AS n FROM matches').get().n,
      coverage: 'Provider-disclosed results only; not full-index or lead-quality proof.' };
  }
  return { db, get, set, close: () => db.close(), summary,
    reserveRequest: () => { const n = get('requests'); if (n >= get('plan').maxRequests) fail('REQUEST_BUDGET', 'Run request budget exhausted.'); set('requests', n + 1); },
    pending: () => db.prepare("SELECT * FROM queries WHERE state='pending' ORDER BY id").all(),
    ingest: (q, page, checkpoint = () => {}) => {
      db.exec('BEGIN IMMEDIATE'); try {
        for (const r of page.results) {
          db.prepare('INSERT OR IGNORE INTO domains VALUES(?)').run(r.domain);
          db.prepare('INSERT OR IGNORE INTO matches VALUES(?,?,?,?,?)').run(r.domain, q.id, r.url, r.rank, Number(r.ranked));
        }
        let state = page.page >= page.total_pages || page.results.length < page.per_page ? 'complete' : 'pending';
        let reason = page.truncated || q.reason === 'PROVIDER_TRUNCATED' ? 'PROVIDER_TRUNCATED' : null;
        if (state === 'pending' && page.page >= get('plan').maxPages) { state = 'partial'; reason ??= 'PAGE_BUDGET'; }
        if (state === 'complete' && reason) state = 'partial';
        db.prepare('UPDATE queries SET next_page=?,state=?,reason=? WHERE id=?').run(page.page + 1, state, reason, q.id);
        checkpoint('before-page-commit'); db.exec('COMMIT'); checkpoint('after-page-commit');
      } catch (e) { if (db.isTransaction) db.exec('ROLLBACK'); throw e; }
    } };
}
export function runLock(file) {
  const path = resolve(file) + '.run-lock'; mkdirSync(dirname(path), { recursive: true });
  let fd; try { fd = openSync(path, 'wx'); writeFileSync(fd, String(process.pid)); } catch { fail('RUN_LOCKED', 'Run is locked. Verify its process ended before explicitly recovering its lock.'); }
  return () => { closeSync(fd); unlinkSync(path); };
}
export function recoverLock(file) {
  const path = resolve(file) + '.run-lock';
  if (!existsSync(path)) return;
  const pid = Number(readFileSync(path, 'utf8'));
  if (!Number.isSafeInteger(pid) || pid < 1) fail('INVALID_LOCK', 'Lock file is invalid; inspect it manually.');
  try { process.kill(pid, 0); fail('RUN_ACTIVE', 'Lock owner process is still active.'); }
  catch (e) { if (e.code !== 'ESRCH') throw e; }
  unlinkSync(path);
}
export function exportRun(store, out, checkpoint = () => {}) {
  const target = resolve(out);
  if (existsSync(target)) fail('EXPORT_EXISTS', 'Export directory already exists. Choose a new directory.');
  const temp = target + `.partial-${process.pid}`;
  if (existsSync(temp)) fail('EXPORT_TEMP_EXISTS', 'Temporary export exists. Choose a new directory.');
  mkdirSync(temp, { recursive: true });
  let matches, domains, summary;
  // Read rows and summary from one committed snapshot, even if another process is ingesting.
  store.db.exec('BEGIN');
  try {
    matches = store.db.prepare('SELECT m.*,q.info FROM matches m JOIN queries q ON m.query_id=q.id ORDER BY domain,query_id,url').all();
    checkpoint('after-export-matches-read');
    domains = store.db.prepare('SELECT domain,COUNT(*) AS match_count FROM matches GROUP BY domain ORDER BY domain').all();
    summary = store.summary(); store.db.exec('COMMIT');
  } catch (e) { if (store.db.isTransaction) store.db.exec('ROLLBACK'); throw e; }
  const files = {
    'domains.csv': csvText(['domain', 'match_count'], domains.map(r => [r.domain, r.match_count])),
    'matches.csv': csvText(['domain','url','rank','ranked','location_id','location','footprint_id','query_id','query'], matches.map(r => { const q = JSON.parse(r.info); return [r.domain,r.url,r.rank,Boolean(r.ranked),q.location_id,q.location,q.footprint_id,q.id,q.query]; })),
    'run-summary.json': JSON.stringify(summary, null, 2) + '\n'
  };
  for (const [name, body] of Object.entries(files)) writeFileSync(join(temp, name), body, 'utf8');
  const manifest = Object.fromEntries(Object.entries(files).map(([name, body]) => [name, { bytes: Buffer.byteLength(body), sha256: createHash('sha256').update(body).digest('hex') }]));
  writeFileSync(join(temp, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  checkpoint('before-export-rename'); renameSync(temp, target); checkpoint('after-export-rename');
  return { directory: target, files: manifest, summary };
}
