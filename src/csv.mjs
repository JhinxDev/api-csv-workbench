import { readFileSync } from 'node:fs';
import { fail } from './errors.mjs';
export function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = []; let row = [], field = '', quoted = false, closed = false, start = true;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else field += c;
    } else if (c === '"') {
      if (!start || closed) fail('INVALID_CSV', 'Unexpected CSV quote.');
      quoted = true; start = false;
    } else if (c === ',' || c === '\n' || c === '\r') {
      row.push(field); field = ''; start = true; closed = false;
      if (c !== ',') { rows.push(row); row = []; if (c === '\r' && text[i + 1] === '\n') i++; }
    } else {
      if (closed) fail('INVALID_CSV', 'Characters after a closing CSV quote.');
      field += c; start = false;
    }
  }
  if (quoted) fail('INVALID_CSV', 'Unclosed CSV quote.');
  if (field !== '' || row.length || closed) { row.push(field); rows.push(row); }
  return rows;
}
export function readCSV(path, headers) {
  let bytes; try { bytes = readFileSync(path); } catch { fail('INPUT_UNAVAILABLE', 'Cannot read an input file.'); }
  if (bytes.length > 1024 * 1024) fail('INPUT_TOO_LARGE', 'Input files are limited to one MiB.');
  let text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('INVALID_UTF8', 'Input must be UTF-8 CSV.'); }
  const rows = parseCSV(text);
  if (JSON.stringify(rows.shift()) !== JSON.stringify(headers)) fail('INVALID_HEADERS', 'CSV headers do not match the documented schema.');
  if (!rows.length || rows.length > 1000) fail('INPUT_ROW_LIMIT', 'Each input needs 1 to 1000 rows.');
  if (rows.some(r => r.length !== headers.length || r.some(v => !v.trim() || v.length > 2048 || /\u0000/.test(v)))) fail('INVALID_ROW', 'An input row is empty, oversized or has the wrong field count.');
  const ids = rows.map(r => r[0]);
  if (ids.some(id => !/^[a-zA-Z0-9_.-]{1,64}$/.test(id)) || new Set(ids).size !== ids.length) fail('INVALID_IDS', 'IDs must be unique ASCII names of at most 64 characters.');
  return rows.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
}
export function csvCell(value) {
  let s = value == null ? '' : String(value);
  // Quote alone does not prevent spreadsheet formulas. Prefix dangerous text, including leading controls/space.
  if (/^[\s\u0000-\u001f]*[=+@-]/u.test(s) || /^[\t\r\n]/u.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
}
export function csvText(headers, rows) { return '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'; }
