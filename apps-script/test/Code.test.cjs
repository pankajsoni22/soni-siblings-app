// Backend tests: runs apps-script/Code.gs against an in-memory mock of the Apps Script services
// (Sheets, Properties, Cache, Lock, UrlFetch). Covers auth gates, validation, CRUD, conflicts,
// soft delete, audit log, and both ways Sheets may store the formula-escape apostrophe.
// Run: npm run test:backend
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert/strict');

const CLIENT_ID = 'client-123.apps.googleusercontent.com';

function makeEnv({ apostrophe, runSetup, maxRows = 5 }) {
  // apostrophe: 'swallow' (Sheets drops a leading ') or 'literal' (stored as typed, plain-text cells)
  class MockSheet {
    constructor(name) { this.name = name; this.cells = []; this.maxRows = maxRows; this.maxCols = 26; }
    cell(r, c) { this.cells[r] ??= []; return (this.cells[r][c] ??= { v: '', fmt: '' }); }
    getLastRow() { let n = 0; this.cells.forEach((row, r) => { if (row && row.some(x => x && x.v !== '')) n = r; }); return n; }
    getLastColumn() { let n = 0; this.cells.forEach(row => row && row.forEach((x, c) => { if (x && x.v !== '') n = Math.max(n, c); })); return n; }
    getMaxRows() { return this.maxRows; }
    insertRowsAfter(_after, n) { this.maxRows += n; }
    setFrozenRows() {}
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
    appendRow() { throw new Error('appendRow should no longer be used'); }
  }

  // Simulates how Sheets stores a value written with setValues.
  function store(v, fmt) {
    if (typeof v !== 'string') return fmt === '@' ? (typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v)) : v;
    if (v.startsWith("'")) return apostrophe === 'literal' && fmt === '@' ? v : v.slice(1);
    if (fmt === '@') return v;
    if (v.startsWith('=')) return '#FORMULA-EXECUTED#';
    if (/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?$/.test(v)) {      // auto-parse into a date (spreadsheet in IST)
      const d = new Date(v.length === 10 ? v + 'T00:00:00+05:30' : v);
      d.setMilliseconds(0);                               // date cells lose the milliseconds
      return d;
    }
    return v;
  }

  const sheets = new Map();
  const ss = {
    getSheetByName: n => sheets.get(n) || null,
    insertSheet: n => { const s = new MockSheet(n); sheets.set(n, s); return s; }
  };
  const props = new Map([['GOOGLE_CLIENT_ID', CLIENT_ID], ['ALLOWED_EMAILS', 'a@gmail.com, B@gmail.com'], ['ADMIN_EMAILS', '']]);
  const cache = new Map();
  let fetches = 0;

  const ctx = {
    console,
    SpreadsheetApp: { getActive: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props.get(k) ?? null }) },
    CacheService: { getScriptCache: () => ({ get: k => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (alg, s) => [...crypto.createHash(alg).update(s).digest()],
      base64EncodeWebSafe: bytes => Buffer.from(bytes).toString('base64url')
    },
    UrlFetchApp: {
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
  vm.runInContext(fs.readFileSync(process.argv[2] ?? path.join(__dirname, '..', 'Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });

  if (runSetup) ctx.setup();
  else {   // tabs with headers typed by hand, no plain-text formatting
    const hdr = (name, cols) => { const s = ss.insertSheet(name); s.getRange(1, 1, 1, cols.length).setValues([cols]); };
    hdr('Items', ['id', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'deleted', 'deletedAt', 'deletedBy', 'title', 'status']);
    hdr('AuditLog', ['timestamp', 'email', 'action', 'entity', 'recordId', 'changes']);
  }

  const call = (token, action, payload) =>
    JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ action, token, payload }) } }).text);
  return { call, ss, ctx, props, fetches: () => fetches };
}

function ok(res) { assert.equal(res.ok, true, JSON.stringify(res)); return res.data; }
function err(res, code) { assert.equal(res.ok, false, JSON.stringify(res)); assert.equal(res.error.code, code, JSON.stringify(res)); return res.error; }

function scenario(opts) {
  const label = JSON.stringify(opts);
  const env = makeEnv(opts);
  const A = 'tok:a@gmail.com', B = 'tok:b@gmail.com';

  // Auth gates
  err(JSON.parse(env.ctx.doPost({ postData: { contents: '{}' } }).text), 'AUTH_REQUIRED');
  err(JSON.parse(env.ctx.doPost({}).text), 'VALIDATION');
  err(env.call('garbage', 'me'), 'AUTH_REQUIRED');
  err(env.call('tok:a@gmail.com:other-client', 'me'), 'AUTH_REQUIRED');
  err(env.call('tok:stranger@gmail.com', 'me'), 'FORBIDDEN');
  assert.deepEqual(ok(env.call(B, 'me')), { email: 'b@gmail.com', name: 'b', isAdmin: false });

  // Validation
  err(env.call(A, 'create', { entity: 'Nope', data: {} }), 'VALIDATION');
  err(env.call(A, 'create', { entity: 'Items', data: { title: 'x', status: 'Maybe' } }), 'VALIDATION');
  err(env.call(A, 'create', { entity: 'Items', data: { title: '   ' } }), 'VALIDATION');
  err(env.call(A, 'create', { entity: 'Items', data: { title: 'x', hack: 1 } }), 'VALIDATION');
  err(env.call(A, 'list', { entity: '__proto__' }), 'VALIDATION');
  err(env.call(A, 'explode', {}), 'VALIDATION');

  // Create more rows than the sheet has (forces row insertion), with risky text
  const tricky = ['+91 98765 43210', '=HYPERLINK("http://evil")', '@mention', '-5 degrees', '2026-11-14', 'plain'];
  const created = tricky.map(title =>
    ok(env.call(A, 'create', { entity: 'Items', data: { title, id: 'forged', createdBy: 'evil@x.com' } })));
  for (const [i, c] of created.entries()) {
    assert.equal(c.title, tricky[i]);
    assert.notEqual(c.id, 'forged');
    assert.equal(c.createdBy, 'a@gmail.com');
    assert.equal(c.status, 'Open');           // default applied
  }

  // Read back exactly what was typed; nothing executed as a formula
  const listed = ok(env.call(B, 'list', { entity: 'Items' }));
  assert.deepEqual(listed.map(r => r.title), tricky, `${label}: titles round-trip`);
  for (const sheet of [env.ss.getSheetByName('Items'), env.ss.getSheetByName('AuditLog')]) {
    const flat = sheet.getDataRange().getValues().flat();
    assert.ok(!flat.includes('#FORMULA-EXECUTED#'), `${label}: formula executed in ${sheet.name}`);
    const dataRows = sheet.getDataRange().getValues().slice(1).flat();
    assert.ok(!dataRows.some(v => v instanceof Date), `${label}: a value became a date cell in ${sheet.name}`);
  }

  // Update round trips, repeatedly, without false conflicts or apostrophe build-up
  let rec = created[0];
  for (let i = 0; i < 3; i++) {
    const before = rec.updatedAt;
    while (new Date().toISOString() === before) { /* ensure a new timestamp */ }
    rec = ok(env.call(A, 'update', { entity: 'Items', id: rec.id, data: { status: i % 2 ? 'Open' : 'Done' }, expectedUpdatedAt: rec.updatedAt }));
    assert.equal(rec.title, tricky[0]);
  }
  const got = ok(env.call(A, 'get', { entity: 'Items', id: rec.id }));
  assert.equal(got.title, tricky[0]);
  assert.equal(got.updatedAt, rec.updatedAt);
  assert.equal(got.updatedBy, 'a@gmail.com');

  // Stale update -> CONFLICT; no-op update returns same record
  err(env.call(B, 'update', { entity: 'Items', id: rec.id, data: { status: 'Done' }, expectedUpdatedAt: created[0].updatedAt }), 'CONFLICT');
  assert.equal(ok(env.call(A, 'update', { entity: 'Items', id: rec.id, data: { status: rec.status }, expectedUpdatedAt: rec.updatedAt })).updatedAt, rec.updatedAt);

  // Soft delete, hidden from list/get, row still present, restore
  ok(env.call(B, 'delete', { entity: 'Items', id: rec.id }));
  assert.equal(ok(env.call(A, 'list', { entity: 'Items' })).length, tricky.length - 1);
  err(env.call(A, 'get', { entity: 'Items', id: rec.id }), 'NOT_FOUND');
  err(env.call(A, 'update', { entity: 'Items', id: rec.id, data: { status: 'Done' }, expectedUpdatedAt: rec.updatedAt }), 'NOT_FOUND');
  const del = ok(env.call(A, 'list', { entity: 'Items', includeDeleted: true })).find(r => r.id === rec.id);
  assert.equal(del.deleted, true); assert.equal(del.deletedBy, 'b@gmail.com');
  const restored = ok(env.call(A, 'restore', { entity: 'Items', id: rec.id }));
  assert.equal(restored.deleted, false); assert.equal(restored.title, tricky[0]);

  // Admin-only restore when ADMIN_EMAILS is set
  env.props.set('ADMIN_EMAILS', 'a@gmail.com');
  ok(env.call(B, 'delete', { entity: 'Items', id: rec.id }));
  err(env.call(B, 'restore', { entity: 'Items', id: rec.id }), 'FORBIDDEN');
  ok(env.call(A, 'restore', { entity: 'Items', id: rec.id }));

  // Removing someone takes effect on the next request, even with a cached token
  env.props.set('ALLOWED_EMAILS', 'a@gmail.com');
  err(env.call(B, 'me'), 'FORBIDDEN');

  // Audit log: one row per write, readable JSON
  const audit = env.ss.getSheetByName('AuditLog').getDataRange().getValues().slice(1);
  const actions = audit.map(r => r[2]);
  assert.deepEqual(actions.filter(a => a === 'create').length, tricky.length);
  assert.ok(actions.includes('update') && actions.includes('delete') && actions.includes('restore'));
  const createAudit = audit.find(r => r[2] === 'create');
  JSON.parse(String(createAudit[5]).replace(/^'/, ''));

  // Token cache: tokeninfo called once per distinct valid token
  assert.ok(env.fetches() <= 8, `too many tokeninfo calls: ${env.fetches()}`);

  console.log('PASS', label);
}

let failed = false;
for (const apostrophe of ['swallow', 'literal']) {
  for (const runSetup of [true, false]) {
    try { scenario({ apostrophe, runSetup }); }
    catch (e) { failed = true; console.log('FAIL', JSON.stringify({ apostrophe, runSetup }), '\n ', e.message); }
  }
}
process.exit(failed ? 1 : 0);
