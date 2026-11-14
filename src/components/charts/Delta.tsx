import { ArrowDown, ArrowUp } from 'lucide-react';

/** "↑ 12.4%" pill. Colour follows direction; text carries the sign too, so colour isn't the only cue. */
export default function Delta({ change }: { change: number | null }) {
  if (change === null || !Number.isFinite(change)) return null;
  const rounded = Math.round(change * 10) / 10;
  if (Math.abs(rounded) < 0.05) return <span className="delta delta-flat">0%</span>;
  const up = rounded > 0;
  return (
    <span className={`delta ${up ? 'delta-up' : 'delta-down'}`}>
      {up ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" />}
      <span className="visually-hidden">{up ? 'up' : 'down'} </span>
      {Math.abs(rounded).toLocaleString('en-IN')}%
    </span>
  );
}
