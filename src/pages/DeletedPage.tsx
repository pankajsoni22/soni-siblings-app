import { useState } from 'react';
import { Link } from 'react-router-dom';
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
      <PageHeader title="Deleted entries">
        <Link to="/transactions" className="btn btn-ghost">Back to transactions</Link>
      </PageHeader>
      <div className="toolbar">
        <PeriodPicker value={period} today={today} onChange={setPeriod} />
      </div>

      {list.error && !list.data ? <div className="card"><ErrorState error={list.error} onRetry={list.reload} /></div>
        : !list.data ? <div className="card"><Loading /></div>
          : rows.length === 0 ? <div className="card"><EmptyState title="No deleted entries in this period" /></div>
            : (
              <ul className="txn-list">
                {rows.map(t => (
                  <li key={t.id} className="txn card">
                    <div className="txn-main">
                      <div className="txn-who">
                        <span className="txn-customer">{t.customerName}</span>
                        <span className="muted txn-date"><DateText value={t.txnDate} /> · <Money value={t.amount} /></span>
                      </div>
                      <div className="txn-figures">
                        <span className="muted">Deleted by {t.deletedBy}</span>
                        <span className="muted"><DateText value={t.deletedAt} /></span>
                      </div>
                      <div className="txn-status">
                        <button type="button" className="btn" disabled={busyId === t.id} onClick={() => void restore(t)}>Restore</button>
                      </div>
                    </div>
                    <div className="txn-actions">
                      <button type="button" className="link-button" onClick={() => setHistoryOf(t)}>History</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

      {historyOf && <HistoryDialog txn={historyOf} onClose={() => setHistoryOf(null)} />}
    </section>
  );
}
