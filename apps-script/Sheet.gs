/**
 * The only file that reads or writes the spreadsheet.
 *
 * Conventions: row 1 holds the headers; columns are found by header name; every written row is
 * formatted as plain text first; text that could run as a formula is escaped; every change is
 * appended to the AuditLog tab.
 */

function columnsOf_(def) {
  return (def.system ? SYSTEM_FIELDS : []).concat(Object.keys(def.fields));
}

/** Opens a tab and checks that every expected column exists. */
function openTable_(name) {
  const def = TABS[name];
  if (!def) throw new Error('Unknown tab: ' + name);
  const sheet = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sheet) throw new Error(`Missing tab "${name}". Run setup.`);
  const lastCol = sheet.getLastColumn();
  const headers = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
  for (const col of columnsOf_(def)) {
    if (!headers.includes(col)) throw new Error(`Tab "${name}" is missing column "${col}". Run setup.`);
  }
  return { name, def, sheet, headers };
}

/** Reads the whole tab in one call and maps rows by header name. Blank rows are skipped. */
function readTable_(name) {
  const table = openTable_(name);
  const values = table.sheet.getDataRange().getValues();
  table.rows = values.slice(1)
    .map((raw, i) => ({ rowNum: i + 2, raw, record: toRecord_(table.def, table.headers, raw) }))
    .filter(r => r.raw.some(v => v !== '' && v !== null));
  return table;
}

/**
 * Appends a record. On `system` tabs the server sets id, timestamps and authorship.
 * opts.audit = false skips the audit entry (the caller writes a combined one).
 */
function insertRecord_(table, fields, actor, opts) {
  opts = opts || {};
  const now = new Date().toISOString();
  const rec = table.def.system
    ? Object.assign({}, fields, {
        id: Utilities.getUuid(),
        createdAt: now, createdBy: actor.email,
        updatedAt: now, updatedBy: actor.email,
        deleted: false, deletedAt: '', deletedBy: ''
      })
    : Object.assign({}, fields);
  appendRow_(table.sheet, toRow_(table.headers, rec, []));
  if (table.name !== AUDIT_TAB && opts.audit !== false) audit_(actor, 'create', table.name, recordKey_(table.def, rec), { new: fields });
  if (table.rows) table.rows.push({ rowNum: table.sheet.getLastRow(), raw: [], record: rec });
  return rec;
}

/**
 * Writes changed fields onto an existing row and logs old and new values.
 * Returns the record unchanged, without writing, when nothing differs.
 *
 * opts.action  audit action name (default 'update')
 * opts.audit   false skips the audit entry (the caller writes a combined one)
 * opts.force   write and bump updatedAt even when no field differs (e.g. only child rows changed)
 */
function updateRecord_(table, row, fields, actor, opts) {
  opts = opts || {};
  const changes = diff_(row.record, fields);
  if (!Object.keys(changes).length && !opts.force) return row.record;
  const rec = Object.assign({}, row.record, fields);
  if (table.def.system) Object.assign(rec, { updatedAt: new Date().toISOString(), updatedBy: actor.email });
  writeCells_(table.sheet, row.rowNum, toRow_(table.headers, rec, row.raw));
  if (opts.audit !== false) audit_(actor, opts.action || 'update', table.name, recordKey_(table.def, rec), changes);
  row.record = rec;
  return rec;
}

/** Soft delete: the row stays, marked with who deleted it and when. Bumps updatedAt. */
function softDelete_(table, row, actor, opts) {
  const fields = { deleted: true, deletedAt: new Date().toISOString(), deletedBy: actor.email };
  return updateRecord_(table, row, fields, actor, Object.assign({ action: 'delete' }, opts));
}

function restoreRecord_(table, row, actor, opts) {
  const fields = { deleted: false, deletedAt: '', deletedBy: '' };
  return updateRecord_(table, row, fields, actor, Object.assign({ action: 'restore' }, opts));
}

function audit_(actor, action, entity, recordId, changes) {
  const table = openTable_(AUDIT_TAB);
  const json = JSON.stringify(changes).slice(0, TABS.AuditLog.fields.changes.max);
  insertRecord_(table, {
    timestamp: new Date().toISOString(),
    email: actor.email,
    action,
    entity,
    recordId: String(recordId),
    changes: json
  }, actor);
}

function recordKey_(def, rec) {
  return def.system ? rec.id : rec[def.key];
}

// ---------------------------------------------------------------------------
// Cell conversion
// ---------------------------------------------------------------------------

function toRecord_(def, headers, raw) {
  const rec = {};
  headers.forEach((h, i) => {
    if (def.system && h === 'deleted') rec[h] = fromCell_({ type: 'boolean' }, raw[i]);
    else if (def.system && SYSTEM_FIELDS.includes(h)) rec[h] = fromCell_(null, raw[i]);
    else if (has_(def.fields, h)) rec[h] = fromCell_(def.fields[h], raw[i]);
  });
  return rec;
}

function fromCell_(field, v) {
  if (v instanceof Date) v = v.toISOString();   // only if someone typed a date into the Sheet by hand
  if (typeof v === 'string' && v.startsWith(TEXT_MARK)) v = v.slice(1);   // undo toCell_'s escape
  if (!field) return v === null || v === undefined ? '' : String(v);
  if (v === '' || v === null || v === undefined) return field.type === 'boolean' ? false : null;
  if (field.type === 'number') return Number(v);
  if (field.type === 'boolean') return v === true || String(v).toUpperCase() === 'TRUE';
  return String(v);
}

/**
 * Builds a full row. Columns the API does not know about keep their current value
 * (re-written as plain values, so keep formulas out of these tabs).
 */
function toRow_(headers, rec, base) {
  return headers.map((h, i) => toCell_(has_(rec, h) ? rec[h] : base[i]));
}

/**
 * Formula injection guard. Text that Sheets could treat specially gets an invisible
 * zero-width-space prefix: a leading = + - @ (formula), tab/CR, or ' (Sheets' own "store as
 * text" marker, which it may silently drop). The marker itself is escaped too, so the rule is
 * reversible: fromCell_ removes exactly one leading marker and the app shows exactly what was typed.
 *
 * A zero-width space is used instead of the usual apostrophe because Sheets never interprets it,
 * whereas a leading apostrophe is kept in some cell formats and stripped in others.
 */
const TEXT_MARK = '​';
const NEEDS_MARK_RE = /^[=+\-@\t\r'​]/;

function toCell_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return NEEDS_MARK_RE.test(v) ? TEXT_MARK + v : v;
  return v;
}

// ---------------------------------------------------------------------------
// Writing rows
// ---------------------------------------------------------------------------

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

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);              // waits up to 10 s, then throws
  try { return fn(); } finally { lock.releaseLock(); }
}
