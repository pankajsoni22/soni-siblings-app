import { useState } from 'react';
import type { Report } from '../../api/types.ts';
import { formatMonth } from '../../lib/fy.ts';
import { formatINR, formatINRCompact, niceCeil } from '../../lib/money.ts';
import Money from '../Money.tsx';

/**
 * Commission by month as columns: one series, one hue, so no legend (the title names it).
 * Each column shows its month's commission, amount lent and count on hover or keyboard focus.
 * "Show table" gives the same figures as a table.
 */
export default function MonthlyChart({ months }: { months: Report['byMonth'] }) {
  const [asTable, setAsTable] = useState(false);
  const top = niceCeil(Math.max(0, ...months.map(m => m.commission)));
  const labelEvery = months.length > 12 ? Math.ceil(months.length / 12) : 1;

  return (
    <div className="chart">
      <div className="chart-head">
        <h2>Commission by month</h2>
        <button type="button" className="link-button" onClick={() => setAsTable(t => !t)} aria-pressed={asTable}>
          {asTable ? 'Show chart' : 'Show table'}
        </button>
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
        <div className="colchart">
          <div className="colchart-axis" aria-hidden="true">
            <span>{formatINRCompact(top)}</span>
            <span>{formatINRCompact(top / 2)}</span>
            <span>₹0</span>
          </div>
          <div className="colchart-plot" role="list" aria-label="Commission by month">
            {months.map((m, i) => (
              <div key={m.month} className="col" role="listitem" tabIndex={0}
                aria-label={`${formatMonth(m.month)}: commission ${formatINR(m.commission)}, lent ${formatINR(m.lent)}, ${m.count} entries`}>
                <div className="col-bar-area">
                  <div className="col-bar" style={{ height: `${top > 0 ? (m.commission / top) * 100 : 0}%` }} />
                </div>
                <span className="col-label" aria-hidden="true">{i % labelEvery === 0 ? formatMonth(m.month).replace(' 20', " '") : ''}</span>
                <div className="col-tip" role="tooltip">
                  <strong>{formatMonth(m.month)}</strong>
                  <span>Commission <Money value={m.commission} /></span>
                  <span>Lent <Money value={m.lent} /></span>
                  <span>{m.count} {m.count === 1 ? 'entry' : 'entries'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
