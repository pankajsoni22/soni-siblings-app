// Runs the Apps Script backend in Node against in-memory mocks of the Google services it uses
// (SpreadsheetApp, PropertiesService, CacheService, LockService, Utilities, UrlFetchApp,
// ContentService). Every .gs file is loaded in name order, the order clasp pushes them in,
// so a top-level dependency between files fails here first.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const BACKEND_DIR = path.join(__dirname, '..');
const CLIENT_ID = 'client-123.apps.googleusercontent.com';
const OWNER = 'owner@gmail.com';

/**
 * @param {object} opts
 * @param {'swallow'|'literal'} [opts.apostrophe] how the mock Sheet stores a leading ' :
 *   'swallow' drops it (normal cells), 'literal' keeps it (plain-text cells)
 * @param {number} [opts.maxRows] rows per new tab, small to force row insertion
 * @param {object} [opts.props] Script Properties
 */
function makeEnv({ apostrophe = 'swallow', maxRows = 5, props = {} } = {}) {
  class MockSheet {
    constructor(name) { this.name = name; this.cells = []; this.maxRows = maxRows; this.frozen = 0; }
    cell(r, c) { this.cells[r] ??= []; return (this.cells[r][c] ??= { v: '', fmt: '' }); }
    getName() { return this.name; }
    getLastRow() { let n = 0; this.cells.forEach((row, r) => { if (row && row.some(x => x && x.v !== '')) n = r; }); return n; }
    getLastColumn() { let n = 0; this.cells.forEach(row => row && row.forEach((x, c) => { if (x && x.v !== '') n = Math.max(n, c); })); return n; }
    getMaxRows() { return this.maxRows; }
    insertRowsAfter(_after, n) { this.maxRows += n; }
    setFrozenRows(n) { this.frozen = n; }
    getDataRange() { return this.getRange(1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
    getRange(r, c, nr = 1, nc = 1) {
      if (r + nr - 1 > this.maxRows) throw new Error(`Range out of bounds: row ${r + nr - 1} > ${this.maxRows}`);
      const sheet = this;
      const each = fn => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) fn(sheet.cell(r + i, c + j), i, j); };
      return {
        getValues() { const out = Array.from({ length: nr }, () => Array(nc).fill('')); each((x, i, j) => { out[i][j] = x.v; }); return out; },
        setValues(vals) { each((x, i, j) => { x.v = store(vals[i][j], x.fmt); }); return this; },
        setNumberFormat(f) { each(x => { x.fmt = f; }); return this; },
        setFontWeight() { return this; }
      };
    }
    appendRow() { throw new Error('appendRow must not be used: it skips the plain-text formatting'); }
  }

  // How Sheets stores a value written with setValues.
  function store(v, fmt) {
    if (typeof v !== 'string') return fmt === '@' ? (typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v)) : v;
    if (v.startsWith("'")) return apostrophe === 'literal' && fmt === '@' ? v : v.slice(1);
    if (fmt === '@') return v;
    if (v.startsWith('=')) return '#FORMULA-EXECUTED#';
    if (/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?$/.test(v)) {   // auto-parsed into a date cell
      const d = new Date(v.length === 10 ? v + 'T00:00:00+05:30' : v);
      d.setMilliseconds(0);
      return d;
    }
    return v;
  }

  const sheets = new Map([['Sheet1', new MockSheet('Sheet1')]]);
  const ss = {
    getSheetByName: n => sheets.get(n) || null,
    insertSheet: n => { const s = new MockSheet(n); sheets.set(n, s); return s; },
    getSheets: () => [...sheets.values()],
    deleteSheet: s => { sheets.delete(s.name); }
  };
  const propStore = new Map(Object.entries({ GOOGLE_CLIENT_ID: CLIENT_ID, OWNER_EMAIL: OWNER, ...props }));
  const cache = new Map();
  const logs = [];
  let fetches = 0;

  const ctx = {
    console: { log: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')) },
    SpreadsheetApp: { getActive: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => propStore.get(k) ?? null, setProperty: (k, v) => { propStore.set(k, String(v)); } }) },
    CacheService: { getScriptCache: () => ({ get: k => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (alg, s) => [...crypto.createHash(alg).update(s).digest()],
      base64EncodeWebSafe: bytes => Buffer.from(bytes).toString('base64url'),
      base64DecodeWebSafe: s => [...Buffer.from(s, 'base64url')],
      computeHmacSha256Signature: (value, key) => [...crypto.createHmac('sha256', key).update(value).digest()].map(b => (b > 127 ? b - 256 : b)),   // Java bytes are signed
      newBlob: bytes => ({ getDataAsString: () => Buffer.from(bytes.map(b => b & 255)).toString('utf8') }),
      formatDate: (date, timeZone, pattern) => {
        if (pattern !== 'yyyy-MM-dd') throw new Error('mock formatDate supports yyyy-MM-dd only');
        return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
      }
    },
    UrlFetchApp: {
      // Test tokens look like "tok:<email>" or "tok:<email>:<audience>"; anything else is invalid.
      fetch(url) {
        fetches++;
        const tok = decodeURIComponent(url.split('id_token=')[1]);
        const [kind, email, aud] = tok.split(':');
        if (kind !== 'tok') return { getResponseCode: () => 400, getContentText: () => '{}' };
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({
            aud: aud || CLIENT_ID, iss: 'https://accounts.google.com', email, email_verified: 'true',
            name: email.split('@')[0], exp: String(Math.floor(Date.now() / 1000) + 3600)
          })
        };
      }
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: s => ({ setMimeType() { return this; }, text: s })
    }
  };
  vm.createContext(ctx);
  const files = fs.readdirSync(BACKEND_DIR).filter(f => f.endsWith('.gs')).sort();
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(BACKEND_DIR, f), 'utf8'), ctx, { filename: f });

  return {
    ss,
    props: propStore,
    fetches: () => fetches,
    /** Runs code inside the backend's global scope, e.g. run('setup()'). */
    run: code => vm.runInContext(code, ctx),
    /** Calls the API the way the browser does; returns the parsed JSON reply. */
    call: (token, action, payload) =>
      JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ action, token, payload }) } }).text),
    rawPost: body => JSON.parse(ctx.doPost(body).text),
    /** What the backend wrote with console.log / console.error. */
    logs,
    tab: name => {
      const s = sheets.get(name);
      return s ? s.getDataRange().getValues() : null;
    }
  };
}

const tok = email => `tok:${email}`;

module.exports = { makeEnv, tok, OWNER, CLIENT_ID };
