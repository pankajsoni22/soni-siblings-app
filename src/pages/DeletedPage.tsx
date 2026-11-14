import { ArrowLeft, History, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { initialsOf } from '../components/shell/navItems.ts';
import { ApiError } from '../api/ApiError.ts';
import type { Transaction } from '../api/types.ts';
import { useApi } from '../api/useApi.ts';
import { useQuery } from '../api/useQuery.ts';
import DateText from '../components/DateText.tsx';
import HistoryDialog from '../components/HistoryDialog.tsx';
import Money from '../components/Money.tsx';
import PageHeader from '../components/PageHeader.tsx';
import PeriodPicker from '../components/PeriodPicker.tsx';
import { EmptyState, ErrorState, Loading } from '../components/States.tsx';
import { useToast } from '../components/toastContext.ts';
import { periodFor, todayIst } from '../lib/fy.ts';

/** Admin only: deleted entries for a period, with who deleted them, and Restore. */
export default function DeletedPage() {
  const api = useApi();
  const toast = useToast();
  const [today] = useState(todayIst);
  const [period, setPeriod] = useState(() => periodFor('thisFY', today));
  const list = useQuery(`deleted:${period.from}:${period.to}`,
    async a => (await a.listTransactions(period.from, period.to, { includeDeleted: true })).filter(t => t.deleted));
  const [restored, setRestored] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [historyOf, setHistoryOf] = useState<Transaction | null>(null);

  async function restore(t: Transaction) {
    setBusyId(t.id);
    try {
      await api.restoreTransaction(t.id);
      setRestored(s => new Set(s).add(t.id));
      toast(`Restored ${t.customerName}; it counts in lists and totals again`);
    } catch (err) {
      if (!ApiError.is(err, 'AUTH_REQUIRED')) toast(err instanceof Error ? err.message : 'Could not restore', 'error');
    } finally {
      setBusyId(null);
    }
  }

  const rows = (list.data ?? []).filter(t => !restored.has(t.id));

  return (
    <section>
      <PageHeader title="Deleted entries" subtitle="Hidden from lists and totals. Restore puts an entry back.">
        <Link to="/transactions" className="btn btn-ghost"><ArrowLeft size={16} aria-hidden="true" /> Transactions</Link>
      </PageHeader>
      <div className="toolbar">
        <PeriodPicker value={period} today={today} onChange={setPeriod} />
      </div>

      {list.error && !list.data ? <div className="card"><ErrorState error={list.error} onRetry={list.reload} /></div>
        : !list.data ? <div className="card"><Loading /></div>
          : rows.length === 0 ? <div className="card"><EmptyState title="No deleted entries in this period" /></div>
            : (
              <div className="card">
                <ul className="user-list">
                  {rows.map(t => (
                    <li key={t.id} className="user-row">
                      <div className="user-who">
                        <span className="recent-avatar" aria-hidden="true">{initialsOf(t.customerName)}</span>
                        <span className="user-text">
                          <span className="user-email">{t.customerName} · <Money value={t.amount} /></span>
                          <span className="user-note">
                            <DateText value={t.txnDate} /> · deleted by {t.deletedBy}, <DateText value={t.deletedAt} />
                          </span>
                        </span>
                      </div>
                      <div className="user-actions">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setHistoryOf(t)}>
                          <History size={15} aria-hidden="true" /> History
                        </button>
                        <button type="button" className="btn btn-sm" disabled={busyId === t.id} onClick={() => void restore(t)}>
                          <Undo2 size={15} aria-hidden="true" /> Restore
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

      {historyOf && <HistoryDialog txn={historyOf} onClose={() => setHistoryOf(null)} />}
    </section>
  );
}
