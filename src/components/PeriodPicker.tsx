import { CalendarRange } from 'lucide-react';
import { useId } from 'react';
import { PERIOD_OPTIONS, periodFor, type Period, type PeriodKey } from '../lib/fy.ts';

/**
 * Chooses the period for a report or list: presets on the Indian financial year, or a custom
 * range. Always calls onChange with a complete Period (from/to filled in).
 */
export default function PeriodPicker({ value, today, onChange, showDetail = true }: {
  value: Period;
  today: string;
  onChange: (period: Period) => void;
  showDetail?: boolean;
}) {
  const id = useId();
  // A custom range starts from the current one, except "from the beginning" (it would start in 2000).
  const pick = (key: PeriodKey) => onChange(periodFor(key, today,
    value.key === 'allTime' ? periodFor('thisMonth', today) : { from: value.from, to: value.to }));
  const setCustom = (from: string, to: string) => {
    if (from && to) onChange(periodFor('custom', today, { from, to }));
  };

  return (
    <div className="period-picker">
      <label htmlFor={`${id}-period`} className="visually-hidden">Period</label>
      <span className="input-icon">
        <CalendarRange size={16} aria-hidden="true" />
        <select id={`${id}-period`} value={value.key} onChange={e => pick(e.target.value as PeriodKey)}>
          {PERIOD_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </span>
      {value.key === 'custom' ? (
        <span className="period-custom">
          <label htmlFor={`${id}-from`} className="visually-hidden">From</label>
          <input id={`${id}-from`} type="date" value={value.from} max={today} onChange={e => setCustom(e.target.value, value.to)} />
          <span aria-hidden="true" className="muted">to</span>
          <label htmlFor={`${id}-to`} className="visually-hidden">To</label>
          <input id={`${id}-to`} type="date" value={value.to} max={today} onChange={e => setCustom(value.from, e.target.value)} />
        </span>
      ) : showDetail ? (
        <span className="period-detail">{value.detail}</span>
      ) : null}
    </div>
  );
}
