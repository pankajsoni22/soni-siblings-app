/**
 * Periods for the dashboard and lists, on the Indian financial year (1 April – 31 March).
 * Quarters: Q1 Apr–Jun, Q2 Jul–Sep, Q3 Oct–Dec, Q4 Jan–Mar.
 * All dates are 'YYYY-MM-DD' strings in India time, compared as text.
 */

export type PeriodKey =
  | 'today' | 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'lastQuarter' | 'thisFY' | 'lastFY' | 'custom';

export interface Period {
  key: PeriodKey;
  from: string;
  to: string;
  /** Short name, e.g. "This quarter". */
  label: string;
  /** What it covers, e.g. "Q3 FY 2026-27 (Oct–Dec 2026)". */
  detail: string;
}

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'thisMonth', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'thisQuarter', label: 'This quarter' },
  { key: 'lastQuarter', label: 'Last quarter' },
  { key: 'thisFY', label: 'This financial year' },
  { key: 'lastFY', label: 'Last financial year' },
  { key: 'custom', label: 'Custom range' }
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const parts = (date: string) => ({ y: Number(date.slice(0, 4)), m: Number(date.slice(5, 7)), d: Number(date.slice(8, 10)) });
const monthName = (m: number) => MONTHS.at(m - 1) ?? '';

/** Today's date in India time. */
export function todayIst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** The calendar year the financial year starts in: FY 2026-27 → 2026. */
export function fyStartYear(date: string): number {
  const { y, m } = parts(date);
  return m >= 4 ? y : y - 1;
}

/** "FY 2026-27" */
export function fyLabel(startYear: number): string {
  return `FY ${startYear}-${pad((startYear + 1) % 100)}`;
}

/** Financial-year quarter (1–4) of a date. */
export function fyQuarter(date: string): number {
  const { m } = parts(date);
  return Math.floor(((m + 8) % 12) / 3) + 1;
}

function monthPeriod(y: number, m: number): { from: string; to: string; detail: string } {
  return { from: ymd(y, m, 1), to: ymd(y, m, lastDayOfMonth(y, m)), detail: `${monthName(m)} ${y}` };
}

function quarterPeriod(startYear: number, q: number): { from: string; to: string; detail: string } {
  const firstMonth = ((q - 1) * 3 + 3) % 12 + 1;          // Q1 → 4, Q2 → 7, Q3 → 10, Q4 → 1
  const y = q === 4 ? startYear + 1 : startYear;
  const lastMonth = firstMonth + 2;
  return {
    from: ymd(y, firstMonth, 1),
    to: ymd(y, lastMonth, lastDayOfMonth(y, lastMonth)),
    detail: `Q${q} ${fyLabel(startYear)} (${monthName(firstMonth)}–${monthName(lastMonth)} ${y})`
  };
}

function fyPeriod(startYear: number): { from: string; to: string; detail: string } {
  return { from: ymd(startYear, 4, 1), to: ymd(startYear + 1, 3, 31), detail: `${fyLabel(startYear)} (Apr ${startYear} – Mar ${startYear + 1})` };
}

/**
 * The date range for a period, relative to `today`. For 'custom', pass the range; it is
 * returned as given (with from and to swapped if reversed).
 */
export function periodFor(key: PeriodKey, today: string, custom?: { from: string; to: string }): Period {
  const label = PERIOD_OPTIONS.find(o => o.key === key)?.label ?? key;
  const { y, m } = parts(today);
  const fy = fyStartYear(today);
  const q = fyQuarter(today);

  let range: { from: string; to: string; detail: string };
  switch (key) {
    case 'today':
      range = { from: today, to: today, detail: formatShortDate(today) };
      break;
    case 'thisMonth':
      range = monthPeriod(y, m);
      break;
    case 'lastMonth':
      range = m === 1 ? monthPeriod(y - 1, 12) : monthPeriod(y, m - 1);
      break;
    case 'thisQuarter':
      range = quarterPeriod(fy, q);
      break;
    case 'lastQuarter':
      range = q === 1 ? quarterPeriod(fy - 1, 4) : quarterPeriod(fy, q - 1);
      break;
    case 'thisFY':
      range = fyPeriod(fy);
      break;
    case 'lastFY':
      range = fyPeriod(fy - 1);
      break;
    case 'custom': {
      const a = custom?.from ?? today, b = custom?.to ?? today;
      const [from, to] = a <= b ? [a, b] : [b, a];
      range = { from, to, detail: `${formatShortDate(from)} – ${formatShortDate(to)}` };
      break;
    }
  }
  return { key, label, ...range };
}

const DAY_MS = 864e5;
const addDays = (date: string, n: number) => new Date(Date.parse(date + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY_MS);

export interface Comparison {
  from: string;
  to: string;
  /** e.g. "vs Oct 2026", "vs same point last quarter". */
  label: string;
}

/**
 * The period to compare against, for "↑ 12% vs last month" figures.
 * Periods still in progress (today, this month/quarter/FY) are compared with the same number of
 * days at the start of the previous period, so a half-finished month isn't compared to a full one.
 */
export function comparisonFor(period: Period, today: string): Comparison {
  const fy = fyStartYear(today);
  const q = fyQuarter(today);
  const { y, m } = parts(today);
  const toDate = (prev: { from: string; to: string }, label: string): Comparison => {
    const elapsed = daysBetween(period.from, today < period.to ? today : period.to);
    const end = addDays(prev.from, elapsed);
    return { from: prev.from, to: end < prev.to ? end : prev.to, label };
  };
  switch (period.key) {
    case 'today':
      return { from: addDays(today, -1), to: addDays(today, -1), label: 'vs yesterday' };
    case 'thisMonth':
      return toDate(m === 1 ? monthPeriod(y - 1, 12) : monthPeriod(y, m - 1), 'vs same point last month');
    case 'lastMonth': {
      const ly = m <= 2 ? y - 1 : y, lm = ((m + 9) % 12) + 1;
      const prev = monthPeriod(ly, lm);
      return { from: prev.from, to: prev.to, label: `vs ${prev.detail}` };
    }
    case 'thisQuarter':
      return toDate(q === 1 ? quarterPeriod(fy - 1, 4) : quarterPeriod(fy, q - 1), 'vs same point last quarter');
    case 'lastQuarter': {
      const prev = q === 1 ? quarterPeriod(fy - 1, 3) : q === 2 ? quarterPeriod(fy - 1, 4) : quarterPeriod(fy, q - 2);
      return { from: prev.from, to: prev.to, label: `vs Q${q <= 2 ? q + 2 : q - 2}` };
    }
    case 'thisFY':
      return toDate(fyPeriod(fy - 1), `vs same point ${fyLabel(fy - 1)}`);
    case 'lastFY':
      return { from: fyPeriod(fy - 2).from, to: fyPeriod(fy - 2).to, label: `vs ${fyLabel(fy - 2)}` };
    case 'custom': {
      const length = daysBetween(period.from, period.to) + 1;
      return { from: addDays(period.from, -length), to: addDays(period.from, -1), label: `vs previous ${length} days` };
    }
  }
}

/** The `count` calendar months ending with the month of `to` (from the 1st of the first). */
export function trailingMonths(to: string, count: number): { from: string; to: string } {
  const { y, m } = parts(to);
  const index = y * 12 + (m - 1) - (count - 1);
  return { from: ymd(Math.floor(index / 12), (index % 12) + 1, 1), to };
}

/** Percentage change, or null when there is nothing to compare with. */
export function percentChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

/** A preset period key from a URL parameter, or the fallback (custom ranges can't come from the URL). */
export function periodKeyFrom(value: string | null, fallback: PeriodKey): PeriodKey {
  const found = PERIOD_OPTIONS.find(o => o.key === value && o.key !== 'custom');
  return found ? found.key : fallback;
}

/** "14 Nov 2026" from "2026-11-14". */
export function formatShortDate(date: string): string {
  const { y, m, d } = parts(date);
  return `${d} ${monthName(m)} ${y}`;
}

/** "Nov 2026" from "2026-11". */
export function formatMonth(month: string): string {
  return `${monthName(Number(month.slice(5, 7)))} ${month.slice(0, 4)}`;
}
