/**
 * One call that gives the app everything it shows, so screens can work from a copy kept in
 * the browser instead of asking the server each time.
 *
 * Payload: { since? } — the `cursor` from the previous sync. Without it, a full copy is sent.
 * With it, only transactions changed since then (re-reading SYNC_OVERLAP_MS before it, so a small
 * clock difference between Google's servers can't make a change slip through).
 *
 * Returns { user, config, partners, full, cursor, transactions, removed }:
 *   transactions  live transactions (with shares) that are new or changed
 *   removed       ids of transactions deleted since `since` (ids only; deleted details are admin-only)
 */
const SYNC_OVERLAP_MS = 5 * 60 * 1000;

function sync_(p, user) {
  const since = typeof p.since === 'string' && !isNaN(Date.parse(p.since)) ? p.since : '';
  const after = since ? new Date(Date.parse(since) - SYNC_OVERLAP_MS).toISOString() : '';

  const rows = readTable_('Transactions').rows.map(r => r.record);
  let cursor = since;
  for (const t of rows) if (t.updatedAt > cursor) cursor = t.updatedAt;

  const changed = after ? rows.filter(t => t.updatedAt > after) : rows;
  const live = changed.filter(t => !t.deleted);
  const removed = after ? changed.filter(t => t.deleted).map(t => t.id) : [];

  const partners = listPartners_();
  const order = partnerOrder_(partners);
  const sharesByTxn = live.length ? groupShares_(readTable_('Shares')) : new Map();

  return {
    user: { email: user.email, name: user.name, role: user.role, isOwner: user.isOwner },
    config: getConfig_(),
    partners: partners.map(pt => ({ id: pt.id, name: pt.name, active: pt.active })),
    full: !since,
    cursor,
    transactions: live.map(t => withShares_(t, sharesByTxn.get(t.id) || [], order)),
    removed
  };
}
