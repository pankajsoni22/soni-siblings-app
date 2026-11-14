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

/** "14 Nov 2026" from "2026-11-14". */
export function formatShortDate(date: string): string {
  const { y, m, d } = parts(date);
  return `${d} ${monthName(m)} ${y}`;
}

/** "Nov 2026" from "2026-11". */
export function formatMonth(month: string): string {
  return `${monthName(Number(month.slice(5, 7)))} ${month.slice(0, 4)}`;
}
