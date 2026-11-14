import { ChartColumn, Table2 } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { Report } from '../../api/types.ts';
import { formatMonth } from '../../lib/fy.ts';
import { formatINR, formatINRCompact, niceCeil } from '../../lib/money.ts';
import Money from '../Money.tsx';

type Measure = 'commission' | 'lent';
const MEASURES: { key: Measure; label: string }[] = [
  { key: 'commission', label: 'Commission' },
  { key: 'lent', label: 'Amount lent' }
];

/** Width of an element: measured before the first paint, then kept up to date on resize. */
function useWidth(ref: RefObject<HTMLElement | null>, deps: unknown): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.floor(el.getBoundingClientRect().width));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, deps]);
  return width;
}

/** Column with a 6px rounded top and a square base on the baseline. */
function barPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return '';
  const r = Math.min(6, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * One measure per month as columns: a single series, so no legend (the title and toggle name it).
 * Hover, tap or keyboard focus on a month shows its figures; "Table" shows them all.
 */
export default function MonthlyChart({ months, title = 'Monthly trend', subtitle }: {
  months: Report['byMonth'];
  title?: string;
  subtitle?: string;
}) {
  const [measure, setMeasure] = useState<Measure>('commission');
  const [asTable, setAsTable] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const width = useWidth(wrapRef, asTable);

  const H = 260, top = 22, bottom = 28, left = 52, right = 4;
  const values = months.map(m => m[measure]);
  const max = niceCeil(Math.max(0, ...values)) || 1;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => max * f);
  const plotW = Math.max(0, width - left - right);
  const plotH = H - top - bottom;
  const band = months.length ? plotW / months.length : 0;
  const barW = Math.max(3, Math.min(30, band * 0.62));
  const labelEvery = Math.max(1, Math.ceil(46 / Math.max(band, 1)));
  const y = (v: number) => top + plotH - (v / max) * plotH;
  const peak = values.indexOf(Math.max(...values));
  const total = values.reduce((a, b) => a + b, 0);
  const activeMonth = active !== null ? months[active] : undefined;

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="card-sub">{subtitle}</p>}
        </div>
        <div className="page-actions">
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
        <table className="data-table">
          <thead>
            <tr><th scope="col">Month</th><th scope="col">Lent</th><th scope="col">Commission</th><th scope="col">Entries</th></tr>
          </thead>
          <tbody>
            {months.map(m => (
              <tr key={m.month}>
                <th scope="row">{formatMonth(m.month)}</th>
                <td><Money value={m.lent} /></td>
                <td><Money value={m.commission} /></td>
                <td>{m.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="chart-wrap" ref={wrapRef}>
          {width > 0 && (
            <svg className={`chart-svg${active !== null ? ' has-hover' : ''}`} width={width} height={H} role="group"
              aria-label={`${MEASURES.find(m => m.key === measure)?.label} by month, ${formatMonth(months[0]?.month ?? '')} to ${formatMonth(months.at(-1)?.month ?? '')}: total ${formatINR(total)}`}
              onMouseLeave={() => setActive(null)}>
              {ticks.map(t => (
                <g key={t}>
                  <line className="grid-line" x1={left} x2={width - right} y1={y(t)} y2={y(t)} />
                  <text className="axis-text" x={left - 8} y={y(t) + 4} textAnchor="end">{formatINRCompact(t)}</text>
                </g>
              ))}
              {months.map((m, i) => {
                const cx = left + band * i + band / 2;
                const v = m[measure];
                return (
                  <g key={m.month}>
                    <path className={`bar${active === i ? ' is-active' : ''}`} d={barPath(cx - barW / 2, y(v), barW, top + plotH - y(v))} />
                    {i % labelEvery === 0 && (
                      <text className="axis-text" x={cx} y={H - 8} textAnchor="middle">{formatMonth(m.month).replace(' 20', " '")}</text>
                    )}
                    {i === peak && v > 0 && active === null && (
                      <text className="peak-label" x={cx} y={y(v) - 7} textAnchor="middle">{formatINRCompact(v)}</text>
                    )}
                    <rect className="bar-hit" x={left + band * i} y={top} width={band} height={plotH} tabIndex={0} role="img"
                      aria-label={`${formatMonth(m.month)}: commission ${formatINR(m.commission)}, lent ${formatINR(m.lent)}, ${m.count} entries`}
                      onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}
                      onClick={() => setActive(i)} />
                  </g>
                );
              })}
            </svg>
          )}
          {activeMonth && active !== null && (
            <div className="chart-tip" role="status"
              style={{ left: Math.min(Math.max(left + band * active + band / 2, 80), width - 80), top: y(activeMonth[measure]) }}>
              <strong>{formatMonth(activeMonth.month)}</strong>
              <div className="chart-tip-row">Commission <b><Money value={activeMonth.commission} /></b></div>
              <div className="chart-tip-row">Lent <b><Money value={activeMonth.lent} /></b></div>
              <div className="chart-tip-row">Entries <b>{activeMonth.count}</b></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
