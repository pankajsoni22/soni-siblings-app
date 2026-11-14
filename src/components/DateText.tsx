import { formatShortDate } from '../lib/fy.ts';

const timestamp = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit'
});

/** A calendar date ('2026-11-14' → 14 Nov 2026) or an ISO timestamp shown in India time. */
export default function DateText({ value }: { value: string | null | undefined }) {
  if (!value) return <span>—</span>;
  const isTimestamp = value.length > 10;
  return (
    <time dateTime={value}>
      {isTimestamp ? timestamp.format(new Date(value)) : formatShortDate(value)}
    </time>
  );
}
