import { domainToASCII } from 'node:url';
import { fail } from './errors.mjs';
export function normalizeResult(row) {
  if (!row || typeof row.domain !== 'string' || typeof row.url !== 'string') fail('INVALID_RESPONSE', 'Provider row has invalid fields.');
  let domain = domainToASCII(row.domain.toLowerCase().replace(/\.$/, ''));
  if (domain.length > 253 || !domain.includes('.') || domain.split('.').some(p => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(p))) fail('INVALID_RESPONSE', 'Provider domain is invalid.');
  let url; try { url = new URL(row.url); } catch { fail('INVALID_RESPONSE', 'Provider URL is invalid.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hostname.toLowerCase().replace(/\.$/, '') !== domain || row.url.length > 4096) fail('INVALID_RESPONSE', 'Provider URL does not match its domain.');
  if (!((row.rank === null && row.ranked === false) || (Number.isSafeInteger(row.rank) && row.rank >= 0 && row.ranked === true))) fail('INVALID_RESPONSE', 'Provider rank is invalid.');
  return { domain, url: url.href, rank: row.rank, ranked: row.ranked };
}
