import { createHash } from 'node:crypto';
import { readCSV } from './csv.mjs';
import { fail } from './errors.mjs';
export const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function makePlan({ locations, footprints, provider = 'fixture', pageSize = 2, maxPages = 5, maxRequests = 100, maxQueries = 100 }) {
  for (const n of [pageSize, maxPages, maxRequests, maxQueries]) if (!Number.isSafeInteger(n) || n < 1) fail('INVALID_LIMIT', 'Limits must be positive integers.');
  if (pageSize > 1000 || maxPages > 1000 || maxRequests > 10000 || maxQueries > 1000) fail('INVALID_LIMIT', 'Limits exceed the bounded workbench caps.');
  if (!['fixture', 'publicwww', 'local-http'].includes(provider)) fail('INVALID_PROVIDER', 'Unknown provider.');
  const locs = readCSV(locations, ['location_id', 'location']);
  const fps = readCSV(footprints, ['footprint_id', 'template']);
  if (locs.length * fps.length > maxQueries || locs.length * fps.length * maxPages > maxRequests) fail('PLAN_BUDGET', 'Query expansion exceeds the explicit query or worst-case page-request budget.');
  const queries = [];
  for (const l of locs) for (const f of fps) {
    if (!f.template.includes('{location}') || /\{(?!location\})[^}]*\}/.test(f.template)) fail('INVALID_TEMPLATE', 'Each template must contain only the supported location placeholder.');
    // Locations are literal quoted phrases; reject syntax that could escape client-provided templates.
    if (/["\\\r\n]/.test(l.location)) fail('INVALID_LOCATION', 'Locations cannot contain quotes, backslashes or line breaks.');
    const query = f.template.replaceAll('{location}', l.location);
    queries.push({ id: hash([l.location_id, f.footprint_id, query]).slice(0, 24), ...l, ...f, query });
  }
  if (queries.length > maxQueries || queries.length * maxPages > maxRequests) fail('PLAN_BUDGET', 'Query expansion exceeds the explicit query or worst-case page-request budget.');
  const body = { schema: 1, provider, pageSize, maxPages, maxRequests, queries };
  return { ...body, fingerprint: hash(body), worstCaseSearchRequests: queries.length * maxPages };
}
