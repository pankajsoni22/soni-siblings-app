/**
 * Dashboard figures for a date range. Deleted transactions never count.
 * Commission counts on the transaction date, whether or not the loan has been repaid;
 * money still out on Pending loans is reported separately.
 */

const MAX_REPORT_MONTHS = 240;

/** Payload: { from, to }. All money in rupees (2 decimals), summed in paise. */
function report_(p) {
  const { from, to } = checkRange_(p);
  const months = monthsBetween_(from, to);
  if (months.length > MAX_REPORT_MONTHS) throw new ApiError('VALIDATION', 'Choose a range of 20 years or less');

  const txns = readTable_('Transactions').rows
    .map(r => r.record)
    .filter(t => !t.deleted && t.txnDate >= from && t.txnDate <= to);
  const ids = new Set(txns.map(t => t.id));
  const shares = readTable_('Shares').rows
    .map(r => r.record)
    .filter(s => !s.deleted && ids.has(s.transactionId));

  let lent = 0, commission = 0, pendingAmount = 0, pendingCount = 0;
  const byMonth = new Map(months.map(m => [m, { month: m, lent: 0, commission: 0, count: 0 }]));
  for (const t of txns) {
    const a = toPaise_(t.amount), c = toPaise_(t.commission);
    lent += a;
    commission += c;
    if (t.repaidStatus === 'PENDING') { pendingAmount += a; pendingCount++; }
    const m = byMonth.get(t.txnDate.slice(0, 7));
    m.lent += a; m.commission += c; m.count++;
  }

  // Earnings by partner: every active partner (even at zero), plus inactive ones who earned.
  const earned = new Map();
  const nameOnShare = new Map();
  for (const s of shares) {
    earned.set(s.partnerId, (earned.get(s.partnerId) || 0) + toPaise_(s.earning));
    nameOnShare.set(s.partnerId, s.partnerName);
  }
  const partners = listPartners_();
  const byPartner = partners
    .filter(pt => pt.active || earned.has(pt.id))
    .map(pt => ({ partnerId: pt.id, partnerName: pt.name, active: pt.active, earning: fromPaise_(earned.get(pt.id) || 0) }));
  for (const [id, paise] of earned) {   // a partner row removed from the Sheet by hand
    if (!partners.some(pt => pt.id === id)) byPartner.push({ partnerId: id, partnerName: nameOnShare.get(id), active: false, earning: fromPaise_(paise) });
  }

  return {
    from,
    to,
    totals: {
      lent: fromPaise_(lent),
      commission: fromPaise_(commission),
      count: txns.length,
      averageRatePct: lent ? Math.round(commission * 100 * RATE_SCALE / lent) / RATE_SCALE : null,   // 4 decimals
      pendingAmount: fromPaise_(pendingAmount),
      pendingCount
    },
    byPartner,
    byMonth: [...byMonth.values()].map(m => ({ month: m.month, lent: fromPaise_(m.lent), commission: fromPaise_(m.commission), count: m.count }))
  };
}

/** ['2026-04', '2026-05', ...] for every month touched by from..to. */
function monthsBetween_(from, to) {
  const out = [];
  let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7));
  const endY = Number(to.slice(0, 4)), endM = Number(to.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    if (out.length > MAX_REPORT_MONTHS) break;
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}
