/**
 * Input checking. Nothing from the browser reaches the Sheet without passing through here.
 */

/**
 * Returns a clean object containing every field of `def`.
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
    case 'date': {
      // Date.parse('2026-02-30') quietly gives 2 March, so the date must read back unchanged.
      const valid = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
        !isNaN(Date.parse(v + 'T00:00:00Z')) &&
        new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
      if (!valid) throw bad('must be a real date (YYYY-MM-DD)');
      return v;
    }
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

/** A commission rate: more than 0 and less than 100, at most 4 decimals. */
function checkRate_(v, name) {
  const n = checkField_(name, { type: 'number', required: true }, v);
  if (!(n > 0 && n < 100)) throw new ApiError('VALIDATION', `${name} must be more than 0 and less than 100`);
  if (!hasMaxDecimals_(n, 4)) throw new ApiError('VALIDATION', `${name} must have at most 4 decimal places`);
  return n;
}

/** A { from, to } date range, both YYYY-MM-DD, from on or before to. */
function checkRange_(p) {
  const from = checkField_('from', { type: 'date', required: true }, p.from);
  const to = checkField_('to', { type: 'date', required: true }, p.to);
  if (from > to) throw new ApiError('VALIDATION', 'from must be on or before to');
  return { from, to };
}

/** Today's date in India time, YYYY-MM-DD. */
function todayIst_() {
  return Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
}

/** Fields whose value differs, as { field: { old, new } }. */
function diff_(oldRec, newFields) {
  const changes = {};
  for (const k of Object.keys(newFields)) {
    if (oldRec[k] !== newFields[k]) changes[k] = { old: oldRec[k], new: newFields[k] };
  }
  return changes;
}

function has_(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}
