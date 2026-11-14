import { formatShortDate, todayIst } from '../lib/fy.ts';

const time = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });

/**
 * A calendar date ('2026-11-14' → 14 Nov 2026) or an ISO timestamp shown in India time
 * (14 Nov 2026, 5:00 pm). Both use the same month names.
 */
export default function DateText({ value }: { value: string | null | undefined }) {
  if (!value) return <span>—</span>;
  if (value.length <= 10) return <time dateTime={value}>{formatShortDate(value)}</time>;
  const at = new Date(value);
  return <time dateTime={value}>{formatShortDate(todayIst(at))}, {time.format(at)}</time>;
}
