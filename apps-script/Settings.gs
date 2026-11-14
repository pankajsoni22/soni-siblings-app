/**
 * App settings and the configuration every screen needs on load.
 */

/** Settings as { key: value }, defaults filled in. Values are text. */
function readSettings_() {
  const out = Object.assign({}, DEFAULT_SETTINGS);
  for (const r of readTable_('Settings').rows) out[r.record.key] = r.record.value;
  return out;
}

/** What the transaction form needs: default rate, active partners with default shares, today. */
function getConfig_() {
  const s = readSettings_();
  return {
    defaultCommissionRatePct: Number(s.defaultCommissionRatePct),
    rateWarningAbovePct: RATE_WARNING_ABOVE_PCT,
    partners: activePartners_().map(p => ({ id: p.id, name: p.name, defaultSharePct: p.defaultSharePct, sortOrder: p.sortOrder })),
    today: todayIst_()
  };
}

/** Admin only. Payload: { defaultCommissionRatePct }. */
function saveSettings_(p, actor) {
  const rate = checkRate_(p.defaultCommissionRatePct, 'defaultCommissionRatePct');
  const table = readTable_('Settings');
  const row = table.rows.find(r => r.record.key === 'defaultCommissionRatePct');
  const value = String(rate);
  if (row) updateRecord_(table, row, { value }, actor);
  else insertRecord_(table, { key: 'defaultCommissionRatePct', value }, actor);
  return getConfig_();
}
