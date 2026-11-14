/**
 * Backend API: Apps Script web app bound to the Google Sheet.
 *
 * This file is a copy of the code that runs in the Apps Script editor, kept in the
 * repo for version history. GitHub Pages does not execute it.
 *
 * Deploy: Execute as "Me", Who has access "Anyone". Ship changes with
 * Deploy → Manage deployments → pencil → New version (keeps the same /exec URL).
 *
 * Script Properties (Project Settings → Script Properties):
 *   GOOGLE_CLIENT_ID  OAuth Web client ID, must match js/config.js exactly
 *   ALLOWED_EMAILS    lowercase, comma-separated list of people allowed in
 *   ADMIN_EMAILS      optional; when set, only these people may restore records
 */

// ---------------------------------------------------------------------------
// Schema: the only entities and fields the API accepts.
// Fill this in from the functional spec. Field types:
//   string  { max }            number { min, max, integer }   boolean
//   enum    { values: [...] }  date   (YYYY-MM-DD)            email   url
// Common options: required, default.
// ---------------------------------------------------------------------------
const ENTITIES = {
  Items: {
    sheet: 'Items',
    fields: {
      title:  { type: 'string', required: true, max: 200 },
      status: { type: 'enum', values: ['Open', 'Done'], required: true, default: 'Open' }
    }
  }
};

const SYSTEM_FIELDS = ['id', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'deleted', 'deletedAt', 'deletedBy'];
const AUDIT_SHEET = 'AuditLog';
const AUDIT_HEADERS = ['timestamp', 'email', 'action', 'entity', 'recordId', 'changes'];
const ACTIONS = ['me', 'list', 'get', 'create', 'update', 'delete', 'restore'];

class ApiError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

function doPost(e) {
  try {
    let req;
    try { req = JSON.parse(e.postData.contents); }
    catch (_) { throw new ApiError('VALIDATION', 'Request body must be JSON'); }
    const user = verifyUser_(req.token);
    return json_({ ok: true, data: route_(req.action, req.payload || {}, user) });
  } catch (err) {
    const code = err.code || 'SERVER';
    if (code === 'SERVER') console.error(err.stack || err);
    return json_({ ok: false, error: { code, message: code === 'SERVER' ? 'Server error' : err.message } });
  }
}

function doGet() {
  return json_({ ok: true, data: 'API is running' });
}

function route_(action, payload, user) {
  if (!ACTIONS.includes(action)) throw new ApiError('VALIDATION', 'Unknown action: ' + action);
  if (action === 'me') return user;

  const def = entity_(payload.entity);
  switch (action) {
    case 'list':    return listRecords_(def, payload);
    case 'get':     return getRecord_(def, payload);
    case 'create':  return withLock_(() => createRecord_(def, payload, user));
    case 'update':  return withLock_(() => updateRecord_(def, payload, user));
    case 'delete':  return withLock_(() => deleteRecord_(def, payload, user));
    case 'restore':
      requireAdmin_(user);
      return withLock_(() => restoreRecord_(def, payload, user));
  }
}

/**
 * Run once from the editor (select "setup" → Run) to create the tabs and headers.
 * Safe to re-run: it only adds missing tabs and columns.
 */
function setup() {
  const ss = SpreadsheetApp.getActive();
  const tabs = Object.values(ENTITIES).map(d => ({ name: d.sheet, headers: SYSTEM_FIELDS.concat(Object.keys(d.fields)) }));
  tabs.push({ name: AUDIT_SHEET, headers: AUDIT_HEADERS });

  for (const t of tabs) {
    const sheet = ss.getSheetByName(t.name) || ss.insertSheet(t.name);
    const lastCol = sheet.getLastColumn();
    const existing = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
    const missing = t.headers.filter(h => !existing.includes(h));
    if (missing.length) sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);

    const width = sheet.getLastColumn();
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, width).setFontWeight('bold');
    // Plain text everywhere, so Sheets never turns ISO dates or IDs into date/number cells.
    sheet.getRange(1, 1, sheet.getMaxRows(), width).setNumberFormat('@');
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function verifyUser_(idToken) {
  if (!idToken || typeof idToken !== 'string') throw new ApiError('AUTH_REQUIRED', 'Sign in required');
  const props = PropertiesService.getScriptProperties();
  const cache = CacheService.getScriptCache();
  const key = 'tok_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken));

  let info = JSON.parse(cache.get(key) || 'null');
  if (!info) {
    const res = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
      { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new ApiError('AUTH_REQUIRED', 'Invalid token');
    info = JSON.parse(res.getContentText());
    if (info.aud !== props.getProperty('GOOGLE_CLIENT_ID')) throw new ApiError('AUTH_REQUIRED', 'Wrong audience');
    if (!['accounts.google.com', 'https://accounts.google.com'].includes(info.iss)) throw new ApiError('AUTH_REQUIRED', 'Wrong issuer');
    if (String(info.email_verified) !== 'true') throw new ApiError('AUTH_REQUIRED', 'Email not verified');
    const ttl = Math.min(300, Number(info.exp) - Math.floor(Date.now() / 1000));
    if (ttl > 0) cache.put(key, JSON.stringify(info), ttl);
  }
  if (Number(info.exp) * 1000 < Date.now()) throw new ApiError('AUTH_REQUIRED', 'Token expired');

  // Checked on every request, so removing someone takes effect immediately.
  const email = String(info.email).toLowerCase();
  if (!emailList_('ALLOWED_EMAILS').includes(email)) throw new ApiError('FORBIDDEN', 'Not allowed');
  return { email, name: info.name || email, isAdmin: emailList_('ADMIN_EMAILS').includes(email) };
}

function emailList_(prop) {
  return (PropertiesService.getScriptProperties().getProperty(prop) || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

/** With no ADMIN_EMAILS configured everyone has equal rights. */
function requireAdmin_(user) {
  if (emailList_('ADMIN_EMAILS').length && !user.isAdmin) {
    throw new ApiError('FORBIDDEN', 'Only admins can do this');
  }
}

// ---------------------------------------------------------------------------
// CRUD handlers
// ---------------------------------------------------------------------------

function listRecords_(def, p) {
  return readTable_(def).rows
    .map(r => r.record)
    .filter(r => p.includeDeleted === true || !r.deleted);
}

function getRecord_(def, p) {
  const row = findRow_(readTable_(def), p.id);
  if (row.record.deleted && p.includeDeleted !== true) throw new ApiError('NOT_FOUND', 'Record not found');
  return row.record;
}

function createRecord_(def, p, user) {
  const table = openTable_(def);
  const now = new Date().toISOString();
  const fields = validate_(def, p.data, null);
  const rec = Object.assign({}, fields, {
    id: Utilities.getUuid(),
    createdAt: now, createdBy: user.email,
    updatedAt: now, updatedBy: user.email,
    deleted: false, deletedAt: '', deletedBy: ''
  });
  appendRow_(table.sheet, toRow_(table.headers, rec, []));
  audit_(user, 'create', def.name, rec.id, { new: fields });
  return rec;
}

function updateRecord_(def, p, user) {
  if (!p.expectedUpdatedAt) throw new ApiError('VALIDATION', '"expectedUpdatedAt" is required');
  const table = readTable_(def);
  const row = findRow_(table, p.id);
  const old = row.record;
  if (old.deleted) throw new ApiError('NOT_FOUND', 'Record not found');
  if (String(p.expectedUpdatedAt) !== old.updatedAt) {
    throw new ApiError('CONFLICT', 'Someone else changed this record. Reload it and try again.');
  }

  const fields = validate_(def, p.data, old);
  const changes = diff_(def, old, fields);
  if (!Object.keys(changes).length) return old;

  const rec = Object.assign({}, old, fields, { updatedAt: new Date().toISOString(), updatedBy: user.email });
  writeRow_(table, row, rec);
  audit_(user, 'update', def.name, rec.id, changes);
  return rec;
}

function deleteRecord_(def, p, user) {
  const table = readTable_(def);
  const row = findRow_(table, p.id);
  if (row.record.deleted) return { id: row.record.id };   // already deleted: no-op

  const now = new Date().toISOString();
  const rec = Object.assign({}, row.record, {
    deleted: true, deletedAt: now, deletedBy: user.email,
    updatedAt: now, updatedBy: user.email      // makes stale edits fail with CONFLICT
  });
  writeRow_(table, row, rec);                  // soft delete only, never deleteRow
  audit_(user, 'delete', def.name, rec.id, {});
  return { id: rec.id };
}

function restoreRecord_(def, p, user) {
  const table = readTable_(def);
  const row = findRow_(table, p.id);
  if (!row.record.deleted) return row.record;

  const rec = Object.assign({}, row.record, {
    deleted: false, deletedAt: '', deletedBy: '',
    updatedAt: new Date().toISOString(), updatedBy: user.email
  });
  writeRow_(table, row, rec);
  audit_(user, 'restore', def.name, rec.id, {});
  return rec;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function entity_(name) {
  if (typeof name !== 'string' || !has_(ENTITIES, name)) {
    throw new ApiError('VALIDATION', 'Unknown entity: ' + name);
  }
  return Object.assign({ name }, ENTITIES[name]);
}

/**
 * Returns a clean object containing every business field.
 * On update, `existing` supplies the values the browser did not send.
 * System fields sent by the browser are ignored; unknown fields are rejected.
 */
function validate_(def, data, existing) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new ApiError('VALIDATION', '"data" must be an object');
  }
  for (const k of Object.keys(data)) {
    if (!has_(def.fields, k) && !SYSTEM_FIELDS.includes(k)) throw new ApiError('VALIDATION', 'Unknown field: ' + k);
  }
  const out = {};
  for (const [name, f] of Object.entries(def.fields)) {
    const v = has_(data, name) ? data[name] : existing ? existing[name] : f.default;
    out[name] = checkField_(name, f, v);
  }
  return out;
}

function checkField_(name, f, v) {
  const bad = msg => new ApiError('VALIDATION', `${name} ${msg}`);
  if (typeof v === 'string') v = v.trim();
  if (v === undefined || v === null || v === '') {
    if (f.required) throw bad('is required');
    return f.type === 'boolean' ? false : null;
  }

  switch (f.type) {
    case 'string': {
      if (typeof v !== 'string') throw bad('must be text');
      const max = f.max || 1000;
      if (v.length > max) throw bad(`must be at most ${max} characters`);
      return v;
    }
    case 'number': {
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n)) throw bad('must be a number');
      if (f.integer && !Number.isInteger(n)) throw bad('must be a whole number');
      if (f.min !== undefined && n < f.min) throw bad(`must be at least ${f.min}`);
      if (f.max !== undefined && n > f.max) throw bad(`must be at most ${f.max}`);
      return n;
    }
    case 'boolean':
      if (typeof v !== 'boolean') throw bad('must be true or false');
      return v;
    case 'enum':
      if (!f.values.includes(v)) throw bad('must be one of: ' + f.values.join(', '));
      return v;
    case 'date':
      if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v))) {
        throw bad('must be a date (YYYY-MM-DD)');
      }
      return v;
    case 'email':
      if (typeof v !== 'string' || v.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw bad('must be an email address');
      return v.toLowerCase();
    case 'url':
      if (typeof v !== 'string' || v.length > 2000 || !/^https?:\/\/\S+$/i.test(v)) throw bad('must be a link starting with http:// or https://');
      return v;
    default:
      throw new Error(`Field "${name}" has unknown type "${f.type}"`);
  }
}

function diff_(def, oldRec, newFields) {
  const changes = {};
  for (const k of Object.keys(def.fields)) {
    if (oldRec[k] !== newFields[k]) changes[k] = { old: oldRec[k], new: newFields[k] };
  }
  return changes;
}

// ---------------------------------------------------------------------------
// Sheet access
// ---------------------------------------------------------------------------

/** Opens the entity's tab and checks that every expected column exists. */
function openTable_(def) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(def.sheet);
  if (!sheet) throw new Error(`Missing tab "${def.sheet}". Run setup.`);
  const lastCol = sheet.getLastColumn();
  const headers = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
  for (const col of SYSTEM_FIELDS.concat(Object.keys(def.fields))) {
    if (!headers.includes(col)) throw new Error(`Tab "${def.sheet}" is missing column "${col}". Run setup.`);
  }
  return { sheet, headers, def };
}

/** Reads the whole tab in one call and maps rows by header name. */
function readTable_(def) {
  const table = openTable_(def);
  const values = table.sheet.getDataRange().getValues();
  table.rows = values.slice(1)
    .map((raw, i) => ({ rowNum: i + 2, raw, record: toRecord_(def, table.headers, raw) }))
    .filter(r => r.record.id);
  return table;
}

function findRow_(table, id) {
  if (typeof id !== 'string' || !id) throw new ApiError('VALIDATION', '"id" is required');
  const row = table.rows.find(r => r.record.id === id);
  if (!row) throw new ApiError('NOT_FOUND', 'Record not found');
  return row;
}

function toRecord_(def, headers, raw) {
  const rec = {};
  headers.forEach((h, i) => {
    if (h === 'deleted') rec[h] = fromCell_({ type: 'boolean' }, raw[i]);
    else if (SYSTEM_FIELDS.includes(h)) rec[h] = fromCell_(null, raw[i]);
    else if (has_(def.fields, h)) rec[h] = fromCell_(def.fields[h], raw[i]);
  });
  return rec;
}

function fromCell_(field, v) {
  if (v instanceof Date) v = v.toISOString();   // only if someone typed a date into the Sheet by hand
  if (typeof v === 'string' && ESCAPED_RE.test(v)) v = v.slice(1);   // undo toCell_'s formula escape
  if (!field) return v === null || v === undefined ? '' : String(v);
  if (v === '' || v === null || v === undefined) return field.type === 'boolean' ? false : null;
  if (field.type === 'number') return Number(v);
  if (field.type === 'boolean') return v === true || String(v).toUpperCase() === 'TRUE';
  return String(v);
}

/**
 * Builds a full row. Columns the API does not know about keep their current value
 * (re-written as plain values, so keep formulas out of entity tabs).
 */
function toRow_(headers, rec, base) {
  return headers.map((h, i) => toCell_(has_(rec, h) ? rec[h] : base[i]));
}

/**
 * Formula injection guard: text starting with = + - @ (or tab/CR) gets a leading apostrophe.
 * Depending on the cell format, Sheets either swallows that apostrophe or stores it literally,
 * so fromCell_ removes it when present. Either way the app shows exactly what the user typed.
 */
const FORMULA_START_RE = /^[=+\-@\t\r]/;
const ESCAPED_RE = /^'[=+\-@\t\r]/;

function toCell_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return FORMULA_START_RE.test(v) ? "'" + v : v;
  return v;
}

/**
 * All writes go through here. Each written row is set to plain text first, so Sheets never
 * turns ISO timestamps, YYYY-MM-DD dates or IDs into date/number cells, even on rows added
 * after `setup` ran. (A converted timestamp would no longer match updatedAt exactly and
 * every later edit of that record would fail with CONFLICT.)
 */
function writeCells_(sheet, rowNum, values) {
  sheet.getRange(rowNum, 1, 1, values.length)
    .setNumberFormat('@')
    .setValues([values]);
}

function appendRow_(sheet, values) {
  const rowNum = sheet.getLastRow() + 1;
  if (rowNum > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 100);
  writeCells_(sheet, rowNum, values);
}

function writeRow_(table, row, rec) {
  writeCells_(table.sheet, row.rowNum, toRow_(table.headers, rec, row.raw));
}

function audit_(user, action, entity, recordId, changes) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(AUDIT_SHEET);
  if (!sheet) throw new Error(`Missing tab "${AUDIT_SHEET}". Run setup.`);
  const json = JSON.stringify(changes).slice(0, 49000);
  appendRow_(sheet, [new Date().toISOString(), user.email, action, entity, recordId, json].map(toCell_));
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);              // waits up to 10 s, then throws
  try { return fn(); } finally { lock.releaseLock(); }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function has_(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}
