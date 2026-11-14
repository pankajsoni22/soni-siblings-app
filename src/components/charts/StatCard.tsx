import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** A labelled figure with an icon and an optional footer (change vs the previous period, a note). */
export default function StatCard({ icon: Icon, label, value, foot }: { icon: LucideIcon; label: string; value: ReactNode; foot?: ReactNode }) {
  return (
    <div className="card stat">
      <div className="stat-top">
        <span className="stat-icon" aria-hidden="true"><Icon size={17} /></span>
        <span className="stat-label">{label}</span>
      </div>
      <span className="stat-value">{value}</span>
      {foot && <span className="stat-foot">{foot}</span>}
    </div>
  );
}
