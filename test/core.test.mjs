import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseCSV, csvText, readCSV } from '../src/csv.mjs';
import { makePlan } from '../src/plan.mjs';
import { normalizeResult } from '../src/normalize.mjs';
import { run } from '../src/engine.mjs';
import { openStore, exportRun } from '../src/store.mjs';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const locations = join(root, 'fixtures/locations.csv'), footprints = join(root, 'fixtures/footprints.csv');
const temp = () => mkdtempSync(join(tmpdir(), 'api-csv-test-'));
const plan = () => makePlan({ locations, footprints });
test('CSV handles BOM, CRLF, doubled quotes, embedded commas/newlines and trailing empty cells', () => {
  assert.deepEqual(parseCSV('\uFEFFa,b\r\n"one,two","a""b\nc"\r\nx,\r\n'), [['a','b'],['one,two','a"b\nc'],['x','']]);
});
for (const text of ['a,"unclosed','a,b"x','a,"b"x']) test('CSV rejects malformed quote ' + JSON.stringify(text), () => assert.throws(() => parseCSV(text), { code: 'INVALID_CSV' }));
test('CSV neutralizes formula and control prefixes without breaking roundtrip columns', () => {
  const cells = ['=1+1',' +SUM(A1)','@x','-4','\tcell','a,b','a"b','a\nb','normal'];
  const rows = parseCSV(csvText(['value'], cells.map(x => [x])));
  assert.deepEqual(rows.slice(1).map(x => x[0]), cells.map((x,i) => i < 5 ? "'" + x : x));
});
test('input schema and UTF8 enforced', () => {
  const dir = temp(), f = join(dir,'input.csv'); writeFileSync(f, Buffer.from([0xff]));
  assert.throws(() => readCSV(f,['a','b']), { code: 'INVALID_UTF8' });
  writeFileSync(f,'a,b\nx,y\nx,z\n'); assert.throws(() => readCSV(f,['a','b']), { code: 'INVALID_IDS' });
});
test('plans expand exact templates and enforce worst-case pages budget', () => {
  const p = plan(); assert.equal(p.queries.length,4); assert.equal(p.worstCaseSearchRequests,20);
  assert.ok(p.queries.some(q => q.query === '"Montréal" "demo-widget.js"'));
  assert.throws(() => makePlan({locations,footprints,maxRequests:19}), {code:'PLAN_BUDGET'});
});
test('host normalization retains subdomains and www, IDNA, trailing dot', () => {
  assert.equal(normalizeResult({domain:'BÜCHER.TEST.',url:'https://xn--bcher-kva.test/',rank:null,ranked:false}).domain,'xn--bcher-kva.test');
  assert.equal(normalizeResult({domain:'www.Example.test',url:'https://www.example.test/',rank:1,ranked:true}).domain,'www.example.test');
  assert.throws(() => normalizeResult({domain:'example.test',url:'https://other.test/',rank:1,ranked:true}), {code:'INVALID_RESPONSE'});
});
test('offline batch deduplicates domains while preserving every query provenance and null ranks', async () => {
  const dir=temp(), db=join(dir,'run.sqlite'); const s=await run(plan(),{db});
  assert.equal(s.state,'complete'); assert.equal(s.domains,3); assert.equal(s.matches,12); assert.equal(s.requests,8);
  const store=openStore(db); const result=exportRun(store,join(dir,'export')); store.close();
  assert.equal(parseCSV(readFileSync(join(result.directory,'domains.csv'),'utf8')).length,4);
  const matches=parseCSV(readFileSync(join(result.directory,'matches.csv'),'utf8'));
  assert.equal(matches.length,13); assert.ok(matches.some(r=>r[0]==='www.example.test' && r[2]==='' && r[3]==='false'));
  assert.throws(()=>{const st=openStore(db);try{exportRun(st,result.directory);}finally{st.close();}}, {code:'EXPORT_EXISTS'});
});
for (const phase of ['before-page-commit','after-page-commit']) test('real process exit '+phase+' recovers to identical export', async () => {
  const dir=temp(), db=join(dir,'crash.sqlite'), reference=join(dir,'reference.sqlite');
  const child=spawnSync(process.execPath,[join(root,'test/crash-worker.mjs'),db,locations,footprints,phase],{encoding:'utf8'});
  assert.equal(child.status,73,child.stderr); assert.ok(existsSync(db+'.run-lock'));
  const s=await run(plan(),{db,resume:true,recover:true}); assert.equal(s.state,'complete'); assert.equal(s.matches,12);
  await run(plan(),{db:reference}); const a=openStore(db), b=openStore(reference);
  exportRun(a,join(dir,'a')); exportRun(b,join(dir,'b')); a.close();b.close();
  for(const f of ['domains.csv','matches.csv'])assert.equal(readFileSync(join(dir,'a',f),'utf8'),readFileSync(join(dir,'b',f),'utf8'));
});
for (const phase of ['before-export-rename','after-export-rename']) test('real process exit '+phase+' exposes only complete export', async () => {
  const dir=temp(),db=join(dir,'run.sqlite'),out=join(dir,'export'); await run(plan(),{db});
  const child=spawnSync(process.execPath,[join(root,'test/crash-worker.mjs'),db,locations,footprints,phase,out]);assert.equal(child.status,73);
  assert.equal(existsSync(out),phase==='after-export-rename');
  const st=openStore(db);const fresh=exportRun(st,join(dir,'fresh'));st.close();
  assert.equal(Object.keys(fresh.files).length,3);
  if(existsSync(out))assert.equal(readFileSync(join(out,'matches.csv'),'utf8'),readFileSync(join(dir,'fresh','matches.csv'),'utf8'));
});
test('changed input/options refuses resume and leaves original state intact', async () => {
  const db=join(temp(),'run.sqlite'); await run(plan(),{db});
  await assert.rejects(run(makePlan({locations,footprints,pageSize:3}),{db,resume:true}), {code:'RESUME_MISMATCH'});
  const st=openStore(db);assert.equal(st.summary().matches,12);st.close();
});
test('held lock prevents concurrent run and active-lock recovery', async () => {
  const db=join(temp(),'run.sqlite');writeFileSync(db+'.run-lock',String(process.pid));
  await assert.rejects(run(plan(),{db}), {code:'RUN_LOCKED'});
  await assert.rejects(run(plan(),{db,resume:true,recover:true}), {code:'RUN_ACTIVE'});
});
test('page cap produces partial status rather than a false complete export', async () => {
  const db=join(temp(),'run.sqlite');const p=makePlan({locations,footprints,maxPages:1});const s=await run(p,{db});
  assert.equal(s.state,'partial');assert.equal(s.queryStates.partial,4);assert.equal(s.matches,8);
});
test('CLI works from unrelated cwd, rejects unknown options and reports offline doctor', () => {
  const cmd=(...args)=>spawnSync(process.execPath,[join(root,'src/cli.mjs'),...args],{cwd:tmpdir(),encoding:'utf8'});
  const d=cmd('doctor','--json');assert.equal(d.status,0);assert.equal(JSON.parse(d.stdout).result.offlineAuthRequired,false);
  const h=cmd('--help');assert.equal(h.status,0);assert.match(h.stdout,/resume/);
  const e=cmd('doctor','--api-key','secret');assert.equal(e.status,1);assert.equal(JSON.parse(e.stdout).error.code,'INVALID_ARGUMENT');assert.ok(!e.stdout.includes('secret'));
});
test('export snapshot stays consistent when a separate writer commits between export reads',()=>{
  const dir=temp(),db=join(dir,'snapshot.sqlite'),st=openStore(db,plan());
  // WAL is used only to permit a real concurrent writer during this regression.
  // The application default DELETE journal instead makes the writer wait for the reader.
  st.db.exec('PRAGMA journal_mode=WAL');
  const out=join(dir,'export');
  const exported=exportRun(st,out,name=>{
    if(name==='after-export-matches-read'){
      const child=spawnSync(process.execPath,[join(root,'test/snapshot-writer.mjs'),db],{encoding:'utf8'});
      assert.equal(child.status,0,child.stderr);
    }
  });
  const summary=JSON.parse(readFileSync(join(out,'run-summary.json'),'utf8'));
  assert.deepEqual(exported.summary,summary);
  assert.equal(summary.matches,0);assert.equal(summary.domains,0);assert.equal(summary.state,'pending');
  assert.equal(parseCSV(readFileSync(join(out,'matches.csv'),'utf8')).length,1);
  assert.equal(parseCSV(readFileSync(join(out,'domains.csv'),'utf8')).length,1);
  assert.equal(st.summary().matches,1);st.close();
});
test('CLI empty pending export is explicitly partial',()=>{
  const dir=temp(),db=join(dir,'pending.sqlite'),st=openStore(db,plan());st.close();
  const r=spawnSync(process.execPath,[join(root,'src/cli.mjs'),'export','--db',db,'--out',join(dir,'export'),'--json'],{encoding:'utf8'});
  assert.equal(r.status,2);assert.equal(JSON.parse(r.stdout).result.summary.state,'pending');
});
