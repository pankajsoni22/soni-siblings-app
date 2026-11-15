/**
 * Groups transactions into days, weeks or months for the dashboard chart.
 * Weeks run Monday–Sunday and are cut at the edges of the range. Sums are in paise, then
 * returned in rupees, so totals match the server's.
 */
import type { Transaction } from '../api/types.ts';
import { addDays, BEGINNING, daysBetween, formatMonth, formatShortDate, lastDayOfMonth } from './fy.ts';

export type Grain = 'day' | 'week' | 'month';

export const GRAIN_LABELS: Record<Grain, string> = { day: 'Daily', week: 'Weekly', month: 'Monthly' };

export interface Bucket {
  /** First date in the bucket, YYYY-MM-DD. */
  from: string;
  to: string;
  /** Short axis label: "14 Nov", "10 Nov" (week start) or "Nov '26". */
  short: string;
  /** Full label for tooltips and the table: "14 Nov 2026", "10–16 Nov 2026", "Nov 2026". */
  label: string;
  lent: number;
  commission: number;
  count: number;
}

/** More bars than this stop being readable, so that grain is not offered. */
const MAX_BARS = 400;

/**
 * The range the chart covers: the period, but starting at the first entry for "From the beginning"
 * (otherwise it would start in the year 2000).
 */
export function chartRange(from: string, to: string, txns: Transaction[]): { from: string; to: string } {
  if (from !== BEGINNING || txns.length === 0) return { from, to };
  const first = txns.reduce((min, t) => (t.txnDate < min ? t.txnDate : min), to);
  return { from: first, to };
}

/** Which grains make sense for a range: daily for up to a year, weekly from a week, monthly from a month. */
export function grainsFor(from: string, to: string): Grain[] {
  const days = daysBetween(from, to) + 1;
  const grains: Grain[] = [];
  if (days <= MAX_BARS) grains.push('day');
  if (days > 7 && days / 7 <= MAX_BARS) grains.push('week');
  if (days > 31) grains.push('month');
  return grains;
}

/** Daily up to a quarter; beyond that monthly, which reads best over long ranges. */
export function defaultGrain(from: string, to: string): Grain {
  const grains = grainsFor(from, to);
  const days = daysBetween(from, to) + 1;
  if (days <= 92 && grains.includes('day')) return 'day';
  return grains.includes('month') ? 'month' : (grains[0] ?? 'day');
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayMonth = (date: string) => `${Number(date.slice(8, 10))} ${SHORT_MONTHS.at(Number(date.slice(5, 7)) - 1) ?? ''}`;

/** Monday on or before the date. */
function weekStart(date: string): string {
  const weekday = new Date(date + 'T00:00:00Z').getUTCDay();       // 0 = Sunday
  return addDays(date, -((weekday + 6) % 7));
}

function emptyBuckets(from: string, to: string, grain: Grain): Bucket[] {
  const out: Bucket[] = [];
  const add = (a: string, b: string, short: string, label: string) =>
    out.push({ from: a, to: b, short, label, lent: 0, commission: 0, count: 0 });

  if (grain === 'day') {
    for (let d = from; d <= to; d = addDays(d, 1)) add(d, d, dayMonth(d), formatShortDate(d));
  } else if (grain === 'week') {
    for (let start = weekStart(from); start <= to; start = addDays(start, 7)) {
      const a = start < from ? from : start;
      const end = addDays(start, 6);
      const b = end > to ? to : end;
      const sameMonth = a.slice(0, 7) === b.slice(0, 7);
      const label = a === b ? formatShortDate(a)
        : sameMonth ? `${Number(a.slice(8, 10))}–${formatShortDate(b)}`
          : `${dayMonth(a)} – ${formatShortDate(b)}`;
      add(a, b, dayMonth(a), label);
    }
  } else {
    let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7));
    while (`${y}-${String(m).padStart(2, '0')}` <= to.slice(0, 7)) {
      const month = `${y}-${String(m).padStart(2, '0')}`;
      const first = `${month}-01`, last = `${month}-${String(lastDayOfMonth(y, m)).padStart(2, '0')}`;
      add(first < from ? from : first, last > to ? to : last, formatMonth(month).replace(' 20', " '"), formatMonth(month));
      if (++m > 12) { m = 1; y++; }
    }
  }
  return out;
}

const paise = (rupees: number) => Math.round(rupees * 100);

/** Every bucket in from..to (empty ones included, so gaps show), with the transactions summed in. */
export function bucketize(txns: Transaction[], from: string, to: string, grain: Grain): Bucket[] {
  const buckets = emptyBuckets(from, to, grain);
  const sums = buckets.map(() => ({ lent: 0, commission: 0, count: 0 }));
  for (const t of txns) {
    if (t.txnDate < from || t.txnDate > to) continue;
    // Buckets are in date order, so binary-search the last one starting on or before the date.
    let lo = 0, hi = buckets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((buckets[mid]?.from ?? '') <= t.txnDate) lo = mid; else hi = mid - 1;
    }
    const s = sums[lo];
    if (!s) continue;
    s.lent += paise(t.amount);
    s.commission += paise(t.commission);
    s.count += 1;
  }
  return buckets.map((b, i) => {
    const s = sums[i] ?? { lent: 0, commission: 0, count: 0 };
    return { ...b, lent: s.lent / 100, commission: s.commission / 100, count: s.count };
  });
}
