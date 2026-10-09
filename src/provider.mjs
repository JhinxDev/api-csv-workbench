import { setTimeout as sleep } from 'node:timers/promises';
import { fail, WorkbenchError } from './errors.mjs';
import { normalizeResult } from './normalize.mjs';
const LIVE = 'https://api.publicwww.com';
export function validatePage(body, query, page, size) {
  if (!body || body.query !== query || body.page !== page || body.per_page !== size || !Array.isArray(body.results)
      || !Number.isSafeInteger(body.total) || body.total < 0 || body.total > 1000000000
      || !Number.isSafeInteger(body.total_pages) || body.total_pages !== Math.ceil(body.total / size)
      || body.returned !== body.results.length || body.results.length > size || typeof body.truncated !== 'boolean'
      || (!body.truncated && body.results.length !== Math.max(0, Math.min(size, body.total - (page - 1) * size)))) fail('INVALID_RESPONSE', 'Provider pagination metadata is inconsistent.');
  return { ...body, results: body.results.map(normalizeResult) };
}
export function fixturePage(query, page, size) {
  const rows = [
    { domain: 'Example.TEST.', url: 'https://example.test/', rank: 12, ranked: true },
    { domain: 'www.example.test', url: 'https://www.example.test/', rank: null, ranked: false },
    { domain: 'bücher.test', url: 'https://xn--bcher-kva.test/booking', rank: 50, ranked: true }
  ];
  const results = rows.slice((page - 1) * size, page * size);
  return { query, page, per_page: size, total: rows.length, total_pages: Math.ceil(rows.length / size), returned: results.length, truncated: false, results };
}
export function createProvider({ kind, localUrl, timeoutMs = 10000, maxBytes = 2 * 1024 * 1024, beforeRequest = () => {}, maxRetries = 2, maxWaitMs = 30000, delay = sleep }) {
  if (kind === 'fixture') return { identity: 'fixture-v1', account: async () => null,
    search: async (q, p, s) => { beforeRequest(); return validatePage(fixturePage(q, p, s), q, p, s); } };
  let origin = LIVE;
  if (kind === 'local-http') {
    let parsed; try { parsed = new URL(localUrl); } catch { fail('INVALID_LOCAL_ORIGIN', 'Local HTTP mode needs a loopback URL.'); }
    if (parsed.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(parsed.hostname) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) fail('INVALID_LOCAL_ORIGIN', 'Local HTTP mode accepts only plain loopback origins.');
    origin = parsed.origin;
  } else if (kind !== 'publicwww') fail('INVALID_PROVIDER', 'Unknown provider.');
  const key = kind === 'publicwww' ? process.env.PUBLICWWW_API_KEY : undefined;
  if (kind === 'publicwww' && (!key || !/^[\x21-\x7e]{1,4096}$/.test(key))) fail('AUTH_MISSING', 'Set a valid PUBLICWWW_API_KEY environment variable for live mode.');
  let lastRequest = 0;
  async function request(path, params) {
    for (let attempt = 0; ; attempt++) {
      // Conservative single-process spacing. Other clients share the provider account limit.
      if (kind === 'publicwww' && lastRequest) await delay(Math.max(0, 6100 - (Date.now() - lastRequest)));
      beforeRequest(); lastRequest = Date.now();
      let response, body;
      try {
        const url = new URL(path, origin);
        for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, String(v));
        const headers = { Accept: 'application/json' };
        if (key) headers.Authorization = `Bearer ${key}`;
        response = await fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
        if (response.status >= 300 && response.status < 400) fail('REDIRECT_REFUSED', 'Provider redirects are refused.');
        if (!(response.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) fail('INVALID_RESPONSE', 'Provider must return JSON.');
        if (Number(response.headers.get('content-length')) > maxBytes) fail('RESPONSE_TOO_LARGE', 'Provider response exceeds the size cap.');
        const reader = response.body.getReader(); let chunks = [], length = 0;
        while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length;
          if (length > maxBytes) { await reader.cancel(); fail('RESPONSE_TOO_LARGE', 'Provider response exceeds the size cap.'); } chunks.push(value); }
        try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
        catch { fail('INVALID_RESPONSE', 'Provider returned malformed JSON.'); }
        // Reflected credentials in otherwise valid responses must not enter state or exports.
        if (key && JSON.stringify(body).includes(key)) fail('SECRET_REFLECTION', 'Provider response contains the configured secret.');
        if (path === '/v1/search' && body && typeof body === 'object' && response.headers.get('x-truncated') === 'true') body.truncated = true;
      } catch (error) {
        if (error instanceof WorkbenchError) throw error;
        if (attempt < maxRetries) { await delay(Math.min(250 * 2 ** attempt, maxWaitMs)); continue; }
        fail('NETWORK_FAILURE', 'Provider request timed out or failed after bounded retries.');
      }
      if (response.ok) return body;
      const code = body?.error?.code;
      if (response.status === 401 || response.status === 403) fail('AUTH_REJECTED', 'Provider rejected authentication or plan access.');
      if (response.status === 429 && ['quota_exceeded', 'snippet_quota_exceeded'].includes(code)) fail('QUOTA_EXHAUSTED', 'Daily quota exhausted. Resume after provider reset.');
      if (response.status === 429 && code === 'too_many_requests') {
        const raw = response.headers.get('retry-after') ?? body.error.retry_after;
        const seconds = Number(raw);
        if (!Number.isFinite(seconds) || seconds < 0) fail('INVALID_RESPONSE', 'Provider returned an invalid retry interval.');
        if (attempt >= maxRetries || seconds * 1000 > maxWaitMs) fail('RATE_LIMITED', 'Provider rate limit requires a later resume.');
        await delay(seconds * 1000); continue;
      }
      if (response.status >= 500 && attempt < maxRetries) { await delay(Math.min(250 * 2 ** attempt, maxWaitMs)); continue; }
      if (code === 'page_too_deep') fail('DEPTH_LIMIT', 'Provider plan prevents further pagination.');
      fail('PROVIDER_ERROR', 'Provider rejected the request after applicable bounded retries.');
    }
  }
  return { identity: kind === 'publicwww' ? 'publicwww-v1' : 'loopback-v1',
    account: async () => {
      const a = await request('/v1/account');
      if (!Number.isSafeInteger(a?.limits?.max_per_page) || a.limits.max_per_page < 1) fail('INVALID_RESPONSE', 'Account limits are missing or invalid.');
      const disclosed = a.limits.disclosed_positions;
      if (disclosed !== undefined && (!Number.isSafeInteger(disclosed) || disclosed < 0)) fail('INVALID_RESPONSE', 'Account disclosed-position metadata is invalid.');
      return { maxPerPage: a.limits.max_per_page, disclosedPositions: disclosed ?? null };
    },
    search: async (q, p, s) => validatePage(await request('/v1/search', { query: q, page: p, per_page: s, format: 'json' }), q, p, s) };
}
