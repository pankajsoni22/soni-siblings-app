import type { Report } from '../../api/types.ts';
import Money from '../Money.tsx';

/**
 * Earnings by partner as a meter list: name, bar, figure per row, bars on one baseline so they
 * compare at a glance. One hue; partner order, not ranked, because partners are a fixed set.
 */
export default function PartnerEarnings({ rows, total }: { rows: Report['byPartner']; total: number }) {
  const max = Math.max(0, ...rows.map(r => r.earning));
  return (
    <ul className="meter-list" aria-label="Earnings by partner">
      {rows.map(r => {
        const share = total > 0 ? Math.round((r.earning / total) * 1000) / 10 : 0;
        return (
          <li key={r.partnerId} className="meter-row">
            <span className="meter-name">
              {r.partnerName}{!r.active && <span className="muted"> (inactive)</span>}
            </span>
            <span className="meter-track" aria-hidden="true">
              <span className="meter-fill" style={{ width: `${max > 0 ? (r.earning / max) * 100 : 0}%` }} />
            </span>
            <span className="meter-value">
              <Money value={r.earning} /> <span className="muted meter-share">{share}%</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
