import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Transaction } from '../../api/types.ts';
import { REPAID_LABELS } from '../../api/types.ts';
import { initialsOf } from '../shell/navItems.ts';
import DateText from '../DateText.tsx';
import Money from '../Money.tsx';
import { EmptyState } from '../States.tsx';

/** The latest entries of the period, newest first. */
export default function RecentEntries({ txns, periodQuery }: { txns: Transaction[]; periodQuery: string }) {
  return (
    <div className="card">
      <div className="card-head">
        <h2>Recent entries</h2>
        <Link to={`/transactions${periodQuery}`} className="link-button">View all <ArrowRight size={15} aria-hidden="true" /></Link>
      </div>
      {txns.length === 0 ? <EmptyState title="No entries in this period" /> : (
        <ul className="recent-list">
          {txns.slice(0, 6).map(t => (
            <li key={t.id} className="recent-row">
              <span className="recent-avatar" aria-hidden="true">{initialsOf(t.customerName)}</span>
              <span className="recent-main">
                <span className="recent-name">{t.customerName}</span>
                <span className="recent-sub"><DateText value={t.txnDate} /> · {REPAID_LABELS[t.repaidStatus]}</span>
              </span>
              <span className="recent-figures">
                <span className="recent-amount"><Money value={t.amount} /></span>
                <span className="recent-comm">+<Money value={t.commission} /></span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
