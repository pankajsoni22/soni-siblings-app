import { ChartColumn, Table2 } from 'lucide-react';
import { useRef, useState } from 'react';
import type { Report } from '../../api/types.ts';
import { GRAIN_LABELS, type Bucket, type Grain } from '../../lib/buckets.ts';
import { formatINR, formatINRCompact, fromPaise, niceCeil, toPaise } from '../../lib/money.ts';
import { partnerColor } from '../../lib/partnerColors.ts';
import Money from '../Money.tsx';
import { barPath, useWidth } from './chartParts.ts';

type Layout = 'grouped' | 'stacked';
const LAYOUTS: { key: Layout; label: string }[] = [
  { key: 'grouped', label: 'Side by side' },
  { key: 'stacked', label: 'Stacked' }
];

/** With more columns than this, they are not tab stops (the table view lists them instead). */
const MAX_FOCUSABLE = 62;
/** Gap between neighbouring bars, and between stacked segments, in px. */
const GAP = 2;
/** Side-by-side bars thinner than this are unreadable; the chart then stacks instead. */
const MIN_GROUPED_BAR = 3;

const earningOf = (b: Bucket, partnerId: string) => b.earnings[partnerId] ?? 0;
const totalOf = (b: Bucket, partners: readonly { partnerId: string }[]) =>
  fromPaise(partners.reduce((s, p) => s + toPaise(earningOf(b, p.partnerId)), 0));

/**
 * Each partner's earnings over time, by day, week or month. Partners keep the colours they have
 * in "Earnings by partner" (same order), and a legend names them, so colour is never the only cue.
 * Side by side compares partners within a date; stacked shows the split of each date's total.
 */
export default function PartnerTrendChart({ buckets, partners, grain, grains, onGrainChange, subtitle }: {
  buckets: Bucket[];
  /** In the same order as the "Earnings by partner" list, which decides colours. */
  partners: Report['byPartner'];
  grain: Grain;
  grains: Grain[];
  onGrainChange: (grain: Grain) => void;
  subtitle?: string;
}) {
  const [layoutChoice, setLayoutChoice] = useState<Layout>('grouped');
  const [asTable, setAsTable] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const width = useWidth(wrapRef, asTable);

  const n = Math.max(1, partners.length);
  const H = 280, top = 22, bottom = 28, left = 52, right = 4;
  const plotW = Math.max(0, width - left - right);
  const plotH = H - top - bottom;
  const band = buckets.length ? plotW / buckets.length : 0;
  const groupW = Math.min(band * 0.8, n * 14 + (n - 1) * GAP);
  const groupedBarW = (groupW - (n - 1) * GAP) / n;
  const canGroup = groupedBarW >= MIN_GROUPED_BAR;
  const layout: Layout = canGroup ? layoutChoice : 'stacked';
  const stackW = Math.max(1, Math.min(30, band * (band > 6 ? 0.62 : 0.8)));

  const peakValue = layout === 'grouped'
    ? Math.max(0, ...buckets.flatMap(b => partners.map(p => earningOf(b, p.partnerId))))
    : Math.max(0, ...buckets.map(b => totalOf(b, partners)));
  const max = niceCeil(peakValue) || 1;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => max * f);
  const y = (v: number) => top + plotH - (v / max) * plotH;
  const h = (v: number) => (v / max) * plotH;
  const labelEvery = Math.max(1, Math.ceil(52 / Math.max(band, 0.1)));
  const focusable = buckets.length <= MAX_FOCUSABLE;
  const unit = grain === 'day' ? 'Day' : grain === 'week' ? 'Week' : 'Month';
  const tableRows = buckets.length > MAX_FOCUSABLE ? buckets.filter(b => b.count > 0) : buckets;
  const activeBucket = active !== null ? buckets[active] : undefined;
  const describe = (b: Bucket) =>
    `${b.label}: ${partners.map(p => `${p.partnerName} ${formatINR(earningOf(b, p.partnerId))}`).join(', ')}`;

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Partner earnings, {GRAIN_LABELS[grain].toLowerCase()}</h2>
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
          {!asTable && canGroup && n > 1 && (
            <div className="segmented" role="group" aria-label="Bar layout">
              {LAYOUTS.map(l => (
                <button key={l.key} type="button" aria-pressed={layout === l.key} onClick={() => setLayoutChoice(l.key)}>{l.label}</button>
              ))}
            </div>
          )}
          <button type="button" className="icon-btn" onClick={() => setAsTable(t => !t)} aria-pressed={asTable}
            aria-label={asTable ? 'Show as chart' : 'Show as table'} title={asTable ? 'Chart' : 'Table'}>
            {asTable ? <ChartColumn size={17} aria-hidden="true" /> : <Table2 size={17} aria-hidden="true" />}
          </button>
        </div>
      </div>

      <ul className="chart-legend" aria-label="Partners">
        {partners.map((p, i) => (
          <li key={p.partnerId}>
            <span className="legend-dot" style={{ background: partnerColor(i) }} aria-hidden="true" />
            {p.partnerName}{!p.active && <span className="muted"> (inactive)</span>}
          </li>
        ))}
      </ul>

      {asTable ? (
        <div className="table-scroll">
          {tableRows.length < buckets.length && <p className="card-sub">Showing only {unit.toLowerCase()}s with entries.</p>}
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">{unit}</th>
                {partners.map(p => <th key={p.partnerId} scope="col">{p.partnerName}</th>)}
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map(b => (
                <tr key={b.from}>
                  <th scope="row">{b.label}</th>
                  {partners.map(p => <td key={p.partnerId}><Money value={earningOf(b, p.partnerId)} /></td>)}
                  <td><Money value={totalOf(b, partners)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart-wrap" ref={wrapRef}>
          {width > 0 && (
            <svg className={`chart-svg${active !== null ? ' has-hover' : ''}`} width={width} height={H} role="group"
              aria-label={`Partner earnings by ${unit.toLowerCase()}, ${buckets[0]?.label ?? ''} to ${buckets.at(-1)?.label ?? ''}`}
              onMouseLeave={() => setActive(null)}>
              {ticks.map(t => (
                <g key={t}>
                  <line className="grid-line" x1={left} x2={width - right} y1={y(t)} y2={y(t)} />
                  <text className="axis-text" x={left - 8} y={y(t) + 4} textAnchor="end">{formatINRCompact(t)}</text>
                </g>
              ))}
              {buckets.map((b, i) => {
                const cx = left + band * i + band / 2;
                let stackTop = top + plotH;
                const lastWithValue = partners.reduce((last, p, k) => (earningOf(b, p.partnerId) > 0 ? k : last), -1);
                return (
                  <g key={b.from} className={active === i ? 'is-active' : undefined}>
                    {partners.map((p, k) => {
                      const v = earningOf(b, p.partnerId);
                      if (v <= 0) return null;
                      if (layout === 'grouped') {
                        const x = cx - groupW / 2 + k * (groupedBarW + GAP);
                        return <path key={p.partnerId} className="bar bar-series" style={{ fill: partnerColor(k) }}
                          d={barPath(x, y(v), groupedBarW, h(v), 4)} />;
                      }
                      // Stacked: bottom-up in partner order, a 2px gap between segments, only the top one rounded.
                      const segH = h(v);
                      const segTop = stackTop - segH;
                      const drawn = k === lastWithValue ? segH : Math.max(0, segH - GAP);
                      const path = barPath(cx - stackW / 2, segTop + (segH - drawn), stackW, drawn, k === lastWithValue ? 4 : 0);
                      stackTop = segTop;
                      return <path key={p.partnerId} className="bar bar-series" style={{ fill: partnerColor(k) }} d={path} />;
                    })}
                    {i % labelEvery === 0 && (
                      <text className="axis-text" x={cx} y={H - 8} textAnchor="middle">{b.short}</text>
                    )}
                    <rect className="bar-hit" x={left + band * i} y={top} width={band} height={plotH}
                      tabIndex={focusable ? 0 : undefined} role="img" aria-label={describe(b)}
                      onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}
                      onClick={() => setActive(i)} />
                  </g>
                );
              })}
            </svg>
          )}
          {activeBucket && active !== null && (
            <div className="chart-tip" role="status"
              style={{ left: Math.min(Math.max(left + band * active + band / 2, 100), width - 100), top: top + 8 }}>
              <strong>{activeBucket.label}</strong>
              {partners.map((p, k) => (
                <div key={p.partnerId} className="chart-tip-row">
                  <span><span className="legend-dot" style={{ background: partnerColor(k) }} aria-hidden="true" /> {p.partnerName}</span>
                  <b><Money value={earningOf(activeBucket, p.partnerId)} /></b>
                </div>
              ))}
              <div className="chart-tip-row chart-tip-total">Total <b><Money value={totalOf(activeBucket, partners)} /></b></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
