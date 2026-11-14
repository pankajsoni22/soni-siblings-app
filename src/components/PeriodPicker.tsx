import { useId } from 'react';
import { PERIOD_OPTIONS, periodFor, type Period, type PeriodKey } from '../lib/fy.ts';

/**
 * Chooses the period for a report or list: presets on the Indian financial year, or a custom
 * range. Always calls onChange with a complete Period (from/to filled in).
 */
export default function PeriodPicker({ value, today, onChange }: {
  value: Period;
  today: string;
  onChange: (period: Period) => void;
}) {
  const id = useId();
  const pick = (key: PeriodKey) => onChange(periodFor(key, today, { from: value.from, to: value.to }));
  const setCustom = (from: string, to: string) => {
    if (from && to) onChange(periodFor('custom', today, { from, to }));
  };

  return (
    <div className="period-picker">
      <label htmlFor={`${id}-period`} className="visually-hidden">Period</label>
      <select id={`${id}-period`} value={value.key} onChange={e => pick(e.target.value as PeriodKey)}>
        {PERIOD_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
      {value.key === 'custom' ? (
        <span className="period-custom">
          <label htmlFor={`${id}-from`} className="visually-hidden">From</label>
          <input id={`${id}-from`} type="date" value={value.from} max={today} onChange={e => setCustom(e.target.value, value.to)} />
          <span aria-hidden="true">to</span>
          <label htmlFor={`${id}-to`} className="visually-hidden">To</label>
          <input id={`${id}-to`} type="date" value={value.to} max={today} onChange={e => setCustom(value.from, e.target.value)} />
        </span>
      ) : (
        <span className="muted period-detail">{value.detail}</span>
      )}
    </div>
  );
}
