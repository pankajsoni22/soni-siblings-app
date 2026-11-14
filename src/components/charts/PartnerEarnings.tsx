import type { Report } from '../../api/types.ts';
import { partnerColor } from '../../lib/partnerColors.ts';
import Money from '../Money.tsx';

/**
 * How the commission splits between partners: a thin proportion bar with no text, and a legend
 * list beside it carrying each name, amount and share (so colour is never the only cue).
 */
export default function PartnerEarnings({ rows, total }: { rows: Report['byPartner']; total: number }) {
  const share = (earning: number) => (total > 0 ? Math.round((earning / total) * 1000) / 10 : 0);
  return (
    <>
      <div className="split-bar" role="img"
        aria-label={`Split: ${rows.map(r => `${r.partnerName} ${share(r.earning)}%`).join(', ')}`}>
        {rows.map((r, i) => r.earning > 0 && (
          <span key={r.partnerId} className="split-seg" style={{ flexGrow: r.earning, flexBasis: 0, background: partnerColor(i) }} />
        ))}
      </div>
      <ul className="legend-list">
        {rows.map((r, i) => (
          <li key={r.partnerId} className="legend-row">
            <span className="legend-dot" style={{ background: partnerColor(i) }} aria-hidden="true" />
            <span className="legend-name">{r.partnerName}{!r.active && <span className="muted"> (inactive)</span>}</span>
            <span className="legend-amount"><Money value={r.earning} /></span>
            <span className="legend-share">{share(r.earning)}%</span>
          </li>
        ))}
      </ul>
    </>
  );
}
