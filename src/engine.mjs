import { createProvider } from './provider.mjs';
import { openStore, runLock, recoverLock } from './store.mjs';
import { fail } from './errors.mjs';
export async function run(plan, { db, resume = false, recover = false, localUrl, checkpoint, providerOptions = {} }) {
  if (recover) recoverLock(db);
  const unlock = runLock(db); let store;
  try {
    store = openStore(db, plan);
    if (!resume && store.get('requests') > 0) fail('USE_RESUME', 'Existing run has attempts. Use resume or a new database.');
    if (store.get('state') === 'complete' || store.get('state') === 'partial' && !store.pending().length) return store.summary();
    const provider = createProvider({ ...providerOptions, kind: plan.provider, localUrl, beforeRequest: store.reserveRequest });
    store.set('state', 'running'); store.set('reason', null);
    try {
      const account = await provider.account();
      if (account && plan.pageSize > account.maxPerPage) fail('PLAN_PAGE_SIZE', 'Requested page size exceeds provider account limits.');
      if (account) store.set('accountLimits', account);
      while (store.pending().length) {
        const q = store.pending()[0]; const info = JSON.parse(q.info);
        // Current /docs/api/requests explicitly caps BOTH size and page*size by max_per_page.
        // disclosed_positions is a separate entitlement, not an alias inferred from its name.
        if (account && (q.next_page * plan.pageSize > account.maxPerPage || account.disclosedPositions !== null && (q.next_page - 1) * plan.pageSize >= account.disclosedPositions)) {
          store.db.prepare("UPDATE queries SET state='partial',reason=COALESCE(reason,'DEPTH_LIMIT') WHERE id=?").run(q.id); continue;
        }
        let page;
        try { page = await provider.search(info.query, q.next_page, plan.pageSize); }
        catch (e) { if (e.code !== 'DEPTH_LIMIT') throw e;
          store.db.prepare("UPDATE queries SET state='partial',reason=COALESCE(reason,'DEPTH_LIMIT') WHERE id=?").run(q.id); continue;
        }
        store.ingest(q, page, checkpoint);
      }
      store.set('state', store.summary().queryStates.partial ? 'partial' : 'complete');
    } catch (e) {
      const resumable = ['QUOTA_EXHAUSTED','RATE_LIMITED','NETWORK_FAILURE','REQUEST_BUDGET'].includes(e.code);
      store.set('state', resumable ? 'partial' : 'failed'); store.set('reason', e.code ?? 'INTERNAL_ERROR');
      // Exportable committed rows survive even when the latest request failed.
    }
    return store.summary();
  } finally { store?.close(); unlock(); }
}
