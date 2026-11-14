/**
 * Partners and their default shares. Admin manages them; everyone reads the active ones via
 * getConfig. Partners are never deleted: a partner who leaves is deactivated, stays on past
 * transactions, and still appears in reports for periods where they earned.
 */

/** All partners in partner order (sortOrder, then name). */
function listPartners_() {
  return sortPartners_(readTable_('Partners').rows.map(r => r.record).filter(p => !p.deleted));
}

function activePartners_() {
  return listPartners_().filter(p => p.active);
}

function sortPartners_(list) {
  return list.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/**
 * Saves the whole partner list at once, so the 100% rule is checked on the final state.
 * Payload: { partners: [{ id?, name, defaultSharePct, active? }] } in display order.
 * Every existing partner must be in the list: deactivate instead of removing.
 */
function savePartners_(p, actor) {
  if (!Array.isArray(p.partners)) throw new ApiError('VALIDATION', '"partners" must be a list');
  if (p.partners.length > 50) throw new ApiError('VALIDATION', 'At most 50 partners');

  const table = readTable_('Partners');
  const existing = table.rows.filter(r => !r.record.deleted);
  const seenIds = new Set();
  const seenNames = new Set();

  const items = p.partners.map((item, i) => {
    if (!item || typeof item !== 'object') throw new ApiError('VALIDATION', 'Each partner must be an object');
    let row = null;
    if (item.id !== undefined && item.id !== null && item.id !== '') {
      row = existing.find(r => r.record.id === item.id) || null;
      if (!row) throw new ApiError('NOT_FOUND', 'Unknown partner: ' + item.id);
      if (seenIds.has(item.id)) throw new ApiError('VALIDATION', 'A partner is listed twice');
      seenIds.add(item.id);
    }
    const fields = validate_(TABS.Partners, {
      name: item.name,
      defaultSharePct: item.defaultSharePct,
      active: item.active === undefined ? true : item.active,
      sortOrder: i
    }, null);
    if (!hasMaxDecimals_(fields.defaultSharePct, 2)) {
      throw new ApiError('VALIDATION', `defaultSharePct of "${fields.name}" must have at most 2 decimal places`);
    }
    const key = fields.name.toLowerCase();
    if (seenNames.has(key)) throw new ApiError('VALIDATION', `Two partners are named "${fields.name}"`);
    seenNames.add(key);
    return { row, fields };
  });

  const missing = existing.find(r => !seenIds.has(r.record.id));
  if (missing) {
    throw new ApiError('VALIDATION', `"${missing.record.name}" is missing from the list. Deactivate partners instead of removing them.`);
  }
  const active = items.filter(it => it.fields.active);
  if (!active.length) throw new ApiError('VALIDATION', 'At least one partner must be active');
  const total = active.reduce((t, it) => t + Math.round(it.fields.defaultSharePct * SHARE_SCALE), 0);
  if (total !== 100 * SHARE_SCALE) {
    throw new ApiError('VALIDATION', `Default shares of active partners add up to ${total / SHARE_SCALE}%; they must total 100%`);
  }

  for (const it of items) {
    if (it.row) updateRecord_(table, it.row, it.fields, actor);
    else insertRecord_(table, it.fields, actor);
  }
  return listPartners_();
}

/** partnerId → position in partner order, for sorting shares. */
function partnerOrder_(partners) {
  const order = new Map();
  (partners || listPartners_()).forEach((pt, i) => order.set(pt.id, i));
  return order;
}
