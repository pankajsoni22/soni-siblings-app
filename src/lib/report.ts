/**
 * Dashboard figures computed in the browser from the synced transactions, so changing the
 * period needs no server call. Mirrors report_ in apps-script/Reports.gs exactly (sums in paise);
 * src/lib/report.test.ts runs both on the same data and checks they agree.
 */
import type { Partner, Report, Transaction } from '../api/types.ts';
import { fromPaise, RATE_SCALE, toPaise } from './money.ts';

type PartnerRef = Pick<Partner, 'id' | 'name' | 'active'>;

/** Every month from..to touches, 'YYYY-MM'. */
function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7));
  const endY = Number(to.slice(0, 4)), endM = Number(to.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

/** Live (not deleted) transactions dated from..to, newest first. */
export function transactionsIn(txns: Iterable<Transaction>, from: string, to: string): Transaction[] {
  const out: Transaction[] = [];
  for (const t of txns) if (!t.deleted && t.txnDate >= from && t.txnDate <= to) out.push(t);
  return out.sort((a, b) => b.txnDate.localeCompare(a.txnDate) || b.createdAt.localeCompare(a.createdAt));
}

/** @param partners all partners, active and inactive, in partner order */
export function computeReport(txns: Iterable<Transaction>, from: string, to: string, partners: readonly PartnerRef[]): Report {
  const list = transactionsIn(txns, from, to);
  let lent = 0, commission = 0, pendingAmount = 0, pendingCount = 0;
  const byMonth = new Map(monthsBetween(from, to).map(m => [m, { month: m, lent: 0, commission: 0, count: 0 }]));
  const earned = new Map<string, number>();
  const nameOnShare = new Map<string, string>();

  for (const t of list) {
    const a = toPaise(t.amount), c = toPaise(t.commission);
    lent += a;
    commission += c;
    if (t.repaidStatus === 'PENDING') { pendingAmount += a; pendingCount++; }
    const m = byMonth.get(t.txnDate.slice(0, 7));
    if (m) { m.lent += a; m.commission += c; m.count++; }
    for (const s of t.shares) {
      earned.set(s.partnerId, (earned.get(s.partnerId) ?? 0) + toPaise(s.earning));
      nameOnShare.set(s.partnerId, s.partnerName);
    }
  }

  const byPartner: Report['byPartner'] = partners
    .filter(p => p.active || earned.has(p.id))
    .map(p => ({ partnerId: p.id, partnerName: p.name, active: p.active, earning: fromPaise(earned.get(p.id) ?? 0) }));
  for (const [id, paise] of earned) {   // a partner row removed from the Sheet by hand
    if (!partners.some(p => p.id === id)) byPartner.push({ partnerId: id, partnerName: nameOnShare.get(id) ?? '', active: false, earning: fromPaise(paise) });
  }

  return {
    from,
    to,
    totals: {
      lent: fromPaise(lent),
      commission: fromPaise(commission),
      count: list.length,
      averageRatePct: lent ? Math.round(commission * 100 * RATE_SCALE / lent) / RATE_SCALE : null,
      pendingAmount: fromPaise(pendingAmount),
      pendingCount
    },
    byPartner,
    byMonth: [...byMonth.values()].map(m => ({ month: m.month, lent: fromPaise(m.lent), commission: fromPaise(m.commission), count: m.count }))
  };
}
