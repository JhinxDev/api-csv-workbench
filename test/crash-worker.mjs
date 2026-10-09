import { makePlan } from '../src/plan.mjs';
import { run } from '../src/engine.mjs';
import { openStore, exportRun } from '../src/store.mjs';
const [db, locations, footprints, phase, out] = process.argv.slice(2);
const checkpoint = name => { if (name === phase) process.exit(73); };
if (phase.includes('export')) { const s = openStore(db); exportRun(s, out, checkpoint); s.close(); }
else await run(makePlan({ locations, footprints }), { db, checkpoint });
