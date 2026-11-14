/**
 * Loans and how their commission is split. A transaction is one row in Transactions plus one
 * row per partner in Shares. The server recalculates every figure; numbers sent by the browser
 * are never stored. Every save writes ONE audit entry covering the transaction and its shares.
 */

/** Fields the browser may set. */
const TXN_INPUT_FIELDS = ['txnDate', 'customerName', 'amount', 'commissionRatePct', 'repaidStatus', 'notes'];
/** Fields the browser may send but the server ignores (it recalculates or owns them). */
const TXN_IGNORED_FIELDS = ['commission', 'shares'];

/**
 * Create (no id) or update (id + expectedUpdatedAt).
 * Payload: { id?, expectedUpdatedAt?, transaction: {...TXN_INPUT_FIELDS}, shares: [{ partnerId, sharePct }] }
 * Returns the transaction with its shares.
 */
function saveTransaction_(p, actor) {
  const txns = readTable_('Transactions');
  const sharesTable = readTable_('Shares');
  const isUpdate = p.id !== undefined && p.id !== null && p.id !== '';

  let row = null;
  let oldShareRows = [];
  if (isUpdate) {
    row = findTxnRow_(txns, p.id, false);
    if (!p.expectedUpdatedAt) throw new ApiError('VALIDATION', '"expectedUpdatedAt" is required to update');
    if (String(p.expectedUpdatedAt) !== row.record.updatedAt) {
      throw new ApiError('CONFLICT', 'Someone else changed this transaction. It has been reloaded; please apply your change again.');
    }
    oldShareRows = shareRowsOf_(sharesTable, row.record.id);
  }

  const partners = listPartners_();
  const fields = checkTransactionInput_(p.transaction, row && row.record);
  const shares = checkShares_(p.shares, partners, oldShareRows.map(r => r.record.partnerId));

  const commission = commissionPaise_(toPaise_(fields.amount), fields.commissionRatePct);
  const earnings = splitPaise_(commission, shares.map(s => s.sharePct));
  fields.commission = fromPaise_(commission);
  const newShares = shares.map((s, i) => ({
    partnerId: s.partner.id,
    partnerName: s.partner.name,
    sharePct: s.sharePct,
    earning: fromPaise_(earnings[i])
  }));
  const order = partnerOrder_(partners);

  if (!isUpdate) {
    const rec = insertRecord_(txns, fields, actor, { audit: false });
    for (const s of newShares) insertRecord_(sharesTable, Object.assign({ transactionId: rec.id }, s), actor, { audit: false });
    audit_(actor, 'create', 'Transactions', rec.id, { new: Object.assign({}, fields, { shares: newShares.map(shareSummary_) }) });
    return withShares_(rec, newShares, order);
  }

  const changes = diff_(row.record, fields);
  const oldShares = oldShareRows.map(r => r.record);
  if (!sameShares_(oldShares, newShares)) {
    changes.shares = { old: sortShares_(oldShares, order).map(shareSummary_), new: newShares.map(shareSummary_) };
  }
  if (!Object.keys(changes).length) return withShares_(row.record, oldShares, order);

  const rec = updateRecord_(txns, row, fields, actor, { audit: false, force: true });
  syncShares_(sharesTable, rec.id, oldShareRows, newShares, actor);
  audit_(actor, 'update', 'Transactions', rec.id, changes);
  return withShares_(rec, newShares, order);
}

/** One transaction with its shares, for the edit form. Deleted ones are NOT_FOUND. Payload: { id }. */
function getTransaction_(p) {
  return withSharesFromSheet_(findTxnRow_(readTable_('Transactions'), p.id, false).record);
}

/** Payload: { id, repaidStatus: 'PENDING' | 'REPAID' }. */
function setRepaid_(p, actor) {
  const status = checkField_('repaidStatus', TABS.Transactions.fields.repaidStatus, p.repaidStatus);
  const txns = readTable_('Transactions');
  const row = findTxnRow_(txns, p.id, false);
  const rec = updateRecord_(txns, row, { repaidStatus: status }, actor);
  return withSharesFromSheet_(rec);
}

/** Soft delete. Payload: { id }. Deleting an already deleted transaction is a no-op. */
function deleteTransaction_(p, actor) {
  const txns = readTable_('Transactions');
  const row = findTxnRow_(txns, p.id, true);
  const rec = row.record.deleted ? row.record : softDelete_(txns, row, actor);
  return { id: rec.id, deletedAt: rec.deletedAt, deletedBy: rec.deletedBy };
}

/**
 * Brings a deleted transaction back. Admins can always do this; anyone else only for a
 * transaction they deleted themselves within the undo window.
 */
function restoreTransaction_(p, actor) {
  const txns = readTable_('Transactions');
  const row = findTxnRow_(txns, p.id, true);
  if (!row.record.deleted) return withSharesFromSheet_(row.record);
  if (actor.role !== 'ADMIN') {
    const own = row.record.deletedBy === actor.email;
    const recent = Date.now() - Date.parse(row.record.deletedAt) <= UNDO_GRACE_MS;
    if (!own || !recent) throw new ApiError('FORBIDDEN', 'Only an admin can restore this transaction');
  }
  return withSharesFromSheet_(restoreRecord_(txns, row, actor));
}

/** Admin only. Every audit entry for one transaction, newest first. Payload: { id }. */
function getHistory_(p) {
  findTxnRow_(readTable_('Transactions'), p.id, true);
  return readTable_(AUDIT_TAB).rows
    .map(r => r.record)
    .filter(a => a.entity === 'Transactions' && a.recordId === p.id)
    .map(a => ({ timestamp: a.timestamp, email: a.email, action: a.action, changes: parseJson_(a.changes) }))
    .reverse();   // the log is append-only, so row order is time order even within one millisecond
}

/**
 * Transactions dated from..to (inclusive) with their shares, newest first.
 * Payload: { from, to, includeDeleted? } — includeDeleted is for admins only.
 */
function listTransactions_(p, actor) {
  const { from, to } = checkRange_(p);
  const includeDeleted = p.includeDeleted === true;
  if (includeDeleted && actor.role !== 'ADMIN') throw new ApiError('FORBIDDEN', 'Only admins can see deleted transactions');

  const txns = readTable_('Transactions').rows
    .map(r => r.record)
    .filter(t => t.txnDate >= from && t.txnDate <= to && (includeDeleted || !t.deleted));
  const sharesByTxn = groupShares_(readTable_('Shares'));
  const order = partnerOrder_();
  return txns
    .sort((a, b) => b.txnDate.localeCompare(a.txnDate) || b.createdAt.localeCompare(a.createdAt))
    .map(t => withShares_(t, sharesByTxn.get(t.id) || [], order));
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function checkTransactionInput_(input, existing) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ApiError('VALIDATION', '"transaction" must be an object');
  }
  const data = {};
  for (const k of Object.keys(input)) {
    if (TXN_INPUT_FIELDS.includes(k)) data[k] = input[k];
    else if (!TXN_IGNORED_FIELDS.includes(k) && !SYSTEM_FIELDS.includes(k)) throw new ApiError('VALIDATION', 'Unknown field: ' + k);
  }
  const fields = validate_(TABS.Transactions, data, existing);
  delete fields.commission;
  if (!hasMaxDecimals_(fields.amount, 2)) throw new ApiError('VALIDATION', 'amount must have at most 2 decimal places');
  checkRate_(fields.commissionRatePct, 'commissionRatePct');
  if (fields.txnDate > todayIst_()) throw new ApiError('VALIDATION', 'txnDate cannot be in the future');
  return fields;
}

/**
 * Validates shares and returns them in partner order as [{ partner, sharePct }].
 * New transactions may only use active partners; an edit may keep an inactive partner who
 * was already on the transaction.
 */
function checkShares_(input, partners, keepPartnerIds) {
  if (!Array.isArray(input) || !input.length) throw new ApiError('VALIDATION', '"shares" must list at least one partner');
  const byId = new Map(partners.map(pt => [pt.id, pt]));
  const seen = new Set();
  const shares = input.map(s => {
    if (!s || typeof s !== 'object') throw new ApiError('VALIDATION', 'Each share must be an object');
    const partner = byId.get(s.partnerId);
    if (!partner) throw new ApiError('VALIDATION', 'Unknown partner: ' + s.partnerId);
    if (!partner.active && !keepPartnerIds.includes(partner.id)) {
      throw new ApiError('VALIDATION', `Partner "${partner.name}" is inactive`);
    }
    if (seen.has(partner.id)) throw new ApiError('VALIDATION', `Partner "${partner.name}" is listed twice`);
    seen.add(partner.id);
    const sharePct = checkField_('sharePct', TABS.Shares.fields.sharePct, s.sharePct);
    if (!hasMaxDecimals_(sharePct, 2)) throw new ApiError('VALIDATION', 'sharePct must have at most 2 decimal places');
    return { partner, sharePct };
  });
  const total = shares.reduce((t, s) => t + Math.round(s.sharePct * SHARE_SCALE), 0);
  if (total !== 100 * SHARE_SCALE) {
    throw new ApiError('VALIDATION', `Shares add up to ${total / SHARE_SCALE}%; they must total 100%`);
  }
  const order = partnerOrder_(partners);
  return shares.sort((a, b) => order.get(a.partner.id) - order.get(b.partner.id));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findTxnRow_(table, id, allowDeleted) {
  if (typeof id !== 'string' || !id) throw new ApiError('VALIDATION', '"id" is required');
  const row = table.rows.find(r => r.record.id === id);
  if (!row || (row.record.deleted && !allowDeleted)) throw new ApiError('NOT_FOUND', 'Transaction not found');
  return row;
}

function shareRowsOf_(sharesTable, txnId) {
  return sharesTable.rows.filter(r => r.record.transactionId === txnId && !r.record.deleted);
}

function groupShares_(sharesTable) {
  const by = new Map();
  for (const r of sharesTable.rows) {
    const s = r.record;
    if (s.deleted) continue;
    if (!by.has(s.transactionId)) by.set(s.transactionId, []);
    by.get(s.transactionId).push(s);
  }
  return by;
}

/** Creates, updates or soft-deletes Shares rows so they match `newShares`. Not audited separately. */
function syncShares_(sharesTable, txnId, oldRows, newShares, actor) {
  for (const s of newShares) {
    const row = oldRows.find(r => r.record.partnerId === s.partnerId);
    if (row) {
      updateRecord_(sharesTable, row, { partnerName: s.partnerName, sharePct: s.sharePct, earning: s.earning }, actor, { audit: false });
    } else {
      insertRecord_(sharesTable, Object.assign({ transactionId: txnId }, s), actor, { audit: false });
    }
  }
  for (const row of oldRows) {
    if (!newShares.some(s => s.partnerId === row.record.partnerId)) softDelete_(sharesTable, row, actor, { audit: false });
  }
}

function sameShares_(a, b) {
  const key = list => JSON.stringify(list.map(shareSummary_).map(s => [s.partnerId, s.partnerName, s.sharePct, s.earning]).sort());
  return key(a) === key(b);
}

function shareSummary_(s) {
  return { partnerId: s.partnerId, partnerName: s.partnerName, sharePct: s.sharePct, earning: s.earning };
}

function sortShares_(shares, order) {
  const pos = s => (order.has(s.partnerId) ? order.get(s.partnerId) : Number.MAX_SAFE_INTEGER);
  return shares.slice().sort((a, b) => pos(a) - pos(b) || String(a.partnerName).localeCompare(String(b.partnerName)));
}

/** The transaction as the API returns it: its fields plus its shares in partner order. */
function withShares_(txn, shares, order) {
  return Object.assign({}, txn, { shares: sortShares_(shares, order).map(shareSummary_) });
}

function withSharesFromSheet_(txn) {
  return withShares_(txn, shareRowsOf_(readTable_('Shares'), txn.id).map(r => r.record), partnerOrder_());
}

function parseJson_(text) {
  try { return JSON.parse(text); } catch (_) { return text; }
}
