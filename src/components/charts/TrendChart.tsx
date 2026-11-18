import { ChartColumn, Table2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { GRAIN_LABELS, type Bucket, type Grain } from '../../lib/buckets.ts';
import { formatINR, formatINRCompact, niceCeil } from '../../lib/money.ts';
import Money from '../Money.tsx';
import { barPath, useWidth } from './chartParts.ts';

type Measure = 'commission' | 'lent';
const MEASURES: { key: Measure; label: string }[] = [
  { key: 'commission', label: 'Commission' },
  { key: 'lent', label: 'Amount lent' }
];

/** With more bars than this, bars are not tab stops (the table view lists them instead). */
const MAX_FOCUSABLE_BARS = 62;

/**
 * One measure over time as columns, by day, week or month: a single series, so no legend
 * (the title and toggles name it). Hover, tap or keyboard focus on a column shows its
 * figures; "Table" lists them all.
 */
export default function TrendChart({ buckets, grain, grains, onGrainChange, subtitle }: {
  buckets: Bucket[];
  grain: Grain;
  /** Grains offered for this range; a toggle shows when there is more than one. */
  grains: Grain[];
  onGrainChange: (grain: Grain) => void;
  subtitle?: string;
}) {
  const [measure, setMeasure] = useState<Measure>('commission');
  const [asTable, setAsTable] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const width = useWidth(wrapRef, asTable);

  const H = 260, top = 22, bottom = 28, left = 52, right = 4;
  const values = buckets.map(b => b[measure]);
  const max = niceCeil(Math.max(0, ...values)) || 1;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => max * f);
  const plotW = Math.max(0, width - left - right);
  const plotH = H - top - bottom;
  const band = buckets.length ? plotW / buckets.length : 0;
  const barW = Math.max(1, Math.min(30, band * (band > 6 ? 0.62 : 0.8)));
  const labelEvery = Math.max(1, Math.ceil(52 / Math.max(band, 0.1)));
  const y = (v: number) => top + plotH - (v / max) * plotH;
  const peak = values.indexOf(Math.max(...values));
  const total = values.reduce((a, b) => a + b, 0);
  const focusable = buckets.length <= MAX_FOCUSABLE_BARS;
  const activeBucket = active !== null ? buckets[active] : undefined;
  const measureLabel = MEASURES.find(m => m.key === measure)?.label ?? '';
  const tableRows = buckets.length > MAX_FOCUSABLE_BARS ? buckets.filter(b => b.count > 0) : buckets;
  const unit = grain === 'day' ? 'Day' : grain === 'week' ? 'Week' : 'Month';

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>{GRAIN_LABELS[grain]} trend</h2>
          {subtitle && <p className="card-sub">{subtitle}</p>}
        </div>
        <div className="chart-controls">
          {grains.length > 1 && (
            <div className="segmented" role="group" aria-label="Group by">
              {grains.map(g => (
                <button key={g} type="button" aria-pressed={grain === g} onClick={() => { setActive(null); onGrainChange(g); }}>
                  {GRAIN_LABELS[g]}
                </button>
              ))}
            </div>
          )}
          <div className="segmented" role="group" aria-label="Measure">
            {MEASURES.map(m => (
              <button key={m.key} type="button" aria-pressed={measure === m.key} onClick={() => setMeasure(m.key)}>{m.label}</button>
            ))}
          </div>
          <button type="button" className="icon-btn" onClick={() => setAsTable(t => !t)} aria-pressed={asTable}
            aria-label={asTable ? 'Show as chart' : 'Show as table'} title={asTable ? 'Chart' : 'Table'}>
            {asTable ? <ChartColumn size={17} aria-hidden="true" /> : <Table2 size={17} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {asTable ? (
        <div className="table-scroll">
          {tableRows.length < buckets.length && <p className="card-sub">Showing only {unit.toLowerCase()}s with entries.</p>}
          <table className="data-table">
            <thead>
              <tr><th scope="col">{unit}</th><th scope="col">Lent</th><th scope="col">Commission</th><th scope="col">Entries</th></tr>
            </thead>
            <tbody>
              {tableRows.map(b => (
                <tr key={b.from}>
                  <th scope="row">{b.label}</th>
                  <td><Money value={b.lent} /></td>
                  <td><Money value={b.commission} /></td>
                  <td>{b.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart-wrap" ref={wrapRef}>
          {width > 0 && (
            <svg className={`chart-svg${active !== null ? ' has-hover' : ''}`} width={width} height={H} role="group"
              aria-label={`${measureLabel} by ${unit.toLowerCase()}, ${buckets[0]?.label ?? ''} to ${buckets.at(-1)?.label ?? ''}: total ${formatINR(total)}`}
              onMouseLeave={() => setActive(null)}>
              {ticks.map(t => (
                <g key={t}>
                  <line className="grid-line" x1={left} x2={width - right} y1={y(t)} y2={y(t)} />
                  <text className="axis-text" x={left - 8} y={y(t) + 4} textAnchor="end">{formatINRCompact(t)}</text>
                </g>
              ))}
              {buckets.map((b, i) => {
                const cx = left + band * i + band / 2;
                const v = b[measure];
                return (
                  <g key={b.from}>
                    <path className={`bar${active === i ? ' is-active' : ''}`} d={barPath(cx - barW / 2, y(v), barW, top + plotH - y(v))} />
                    {i % labelEvery === 0 && (
                      <text className="axis-text" x={cx} y={H - 8} textAnchor="middle">{b.short}</text>
                    )}
                    {i === peak && v > 0 && active === null && (
                      <text className="peak-label" x={Math.min(Math.max(cx, left + 20), width - right - 20)} y={y(v) - 7} textAnchor="middle">
                        {formatINRCompact(v)}
                      </text>
                    )}
                    <rect className="bar-hit" x={left + band * i} y={top} width={band} height={plotH}
                      tabIndex={focusable ? 0 : undefined} role="img"
                      aria-label={`${b.label}: commission ${formatINR(b.commission)}, lent ${formatINR(b.lent)}, ${b.count} entries`}
                      onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}
                      onClick={() => setActive(i)} />
                  </g>
                );
              })}
            </svg>
          )}
          {activeBucket && active !== null && (
            <div className="chart-tip" role="status"
              style={{ left: Math.min(Math.max(left + band * active + band / 2, 90), width - 90), top: y(activeBucket[measure]) }}>
              <strong>{activeBucket.label}</strong>
              <div className="chart-tip-row">Commission <b><Money value={activeBucket.commission} /></b></div>
              <div className="chart-tip-row">Lent <b><Money value={activeBucket.lent} /></b></div>
              <div className="chart-tip-row">Entries <b>{activeBucket.count}</b></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
