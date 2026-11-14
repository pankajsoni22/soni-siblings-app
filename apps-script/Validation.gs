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
