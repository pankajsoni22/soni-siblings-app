import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/ApiError.ts';
import type { RepaidStatus, Transaction } from '../api/types.ts';
import { REPAID_LABELS } from '../api/types.ts';
import { useApi } from '../api/useApi.ts';
import { useQuery } from '../api/useQuery.ts';
import { can } from '../auth/permissions.ts';
import { useAuth } from '../auth/useAuth.ts';
import ConfirmDialog from '../components/ConfirmDialog.tsx';
import DateText from '../components/DateText.tsx';
import Money from '../components/Money.tsx';
import PageHeader from '../components/PageHeader.tsx';
import PeriodPicker from '../components/PeriodPicker.tsx';
import { EmptyState, ErrorState, Loading } from '../components/States.tsx';
import { useToast } from '../components/toastContext.ts';
import { downloadCsv, partnerColumnsOf, transactionsToCsv } from '../lib/csv.ts';
import { periodFor, periodKeyFrom, todayIst } from '../lib/fy.ts';
import { formatINR, fromPaise, toPaise } from '../lib/money.ts';
import { formatPct } from '../lib/transactionForm.ts';

type StatusFilter = 'ALL' | RepaidStatus;

/** Local changes shown before the list reloads. Only applied to the data they were made on. */
interface Patches {
  base: Transaction[] | undefined;
  changes: Map<string, Transaction | null>;   // null = deleted
}

export default function TransactionsPage() {
  const api = useApi();
  const toast = useToast();
  const { me } = useAuth();
  const canWrite = can(me?.role, 'saveTransaction');

  const [searchParams] = useSearchParams();
  const [today] = useState(todayIst);
  const [period, setPeriod] = useState(() => periodFor(periodKeyFrom(searchParams.get('period'), 'thisMonth'), today));
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const list = useQuery(`txns:${period.from}:${period.to}`, a => a.listTransactions(period.from, period.to));

  const [patches, setPatches] = useState<Patches>({ base: undefined, changes: new Map() });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Transaction | null>(null);

  const rows = useMemo(() => {
    const changes = patches.base === list.data ? patches.changes : new Map<string, Transaction | null>();
    const base = list.data ?? [];
    const out: Transaction[] = [];
    for (const t of base) {
      const c = changes.has(t.id) ? changes.get(t.id) : t;
      if (c) out.push(c);
    }
    return out;
  }, [list.data, patches]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(t =>
      (status === 'ALL' || t.repaidStatus === status) &&
      (!q || t.customerName.toLowerCase().includes(q) || (t.notes ?? '').toLowerCase().includes(q)));
  }, [rows, search, status]);

  const totals = useMemo(() => ({
    lent: fromPaise(filtered.reduce((s, t) => s + toPaise(t.amount), 0)),
    commission: fromPaise(filtered.reduce((s, t) => s + toPaise(t.commission), 0))
  }), [filtered]);

  const patch = (id: string, value: Transaction | null) =>
    setPatches(p => ({ base: list.data, changes: new Map(p.base === list.data ? p.changes : []).set(id, value) }));

  const failMessage = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong');

  async function toggleRepaid(t: Transaction) {
    const next: RepaidStatus = t.repaidStatus === 'PENDING' ? 'REPAID' : 'PENDING';
    setBusyId(t.id);
    try {
      patch(t.id, await api.setRepaid(t.id, next));
    } catch (err) {
      if (!ApiError.is(err, 'AUTH_REQUIRED')) toast(failMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    const t = toDelete;
    if (!t) return;
    setBusyId(t.id);
    try {
      await api.deleteTransaction(t.id);
      patch(t.id, null);
      setToDelete(null);
      toast(`Deleted ${t.customerName}, ${formatINR(t.amount)}`, 'info', {
        actionLabel: 'Undo',
        durationMs: 10_000,
        onAction: () => void undo(t)
      });
    } catch (err) {
      setToDelete(null);
      if (!ApiError.is(err, 'AUTH_REQUIRED')) toast(failMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function undo(t: Transaction) {
    try {
      patch(t.id, await api.restoreTransaction(t.id));
      toast('Restored');
    } catch (err) {
      if (!ApiError.is(err, 'AUTH_REQUIRED')) toast(failMessage(err), 'error');
    }
  }

  function exportCsv() {
    downloadCsv(`transactions_${period.from}_${period.to}.csv`, transactionsToCsv(filtered, partnerColumnsOf(filtered)));
  }

  return (
    <section>
      <PageHeader title="Transactions">
        {canWrite && <Link to="/transactions/new" className="btn">New entry</Link>}
      </PageHeader>

      <div className="toolbar">
        <PeriodPicker value={period} today={today} onChange={setPeriod} />
        <label className="visually-hidden" htmlFor="txn-search">Search customer or notes</label>
        <input id="txn-search" type="search" placeholder="Search customer" value={search} onChange={e => setSearch(e.target.value)} />
        <label className="visually-hidden" htmlFor="txn-status">Status</label>
        <select id="txn-status" value={status} onChange={e => setStatus(e.target.value as StatusFilter)}>
          <option value="ALL">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="REPAID">Repaid</option>
        </select>
        <button type="button" className="btn btn-ghost" onClick={exportCsv} disabled={!filtered.length}>Export CSV</button>
      </div>

      {list.error && !list.data ? (
        <div className="card"><ErrorState error={list.error} onRetry={list.reload} /></div>
      ) : !list.data ? (
        <div className="card"><Loading /></div>
      ) : (
        <>
          <p className="muted summary" aria-live="polite">
            {filtered.length} {filtered.length === 1 ? 'transaction' : 'transactions'} · lent <Money value={totals.lent} /> ·
            commission <Money value={totals.commission} />
            {list.loading && ' · refreshing…'}
          </p>
          {filtered.length === 0 ? (
            <div className="card">
              <EmptyState title={rows.length ? 'Nothing matches the search' : 'No transactions in this period'}>
                {canWrite && !rows.length && <Link to="/transactions/new">Record a new entry</Link>}
              </EmptyState>
            </div>
          ) : (
            <ul className="txn-list">
              {filtered.map(t => (
                <TransactionRow key={t.id} txn={t} canWrite={canWrite} busy={busyId === t.id}
                  onToggleRepaid={() => void toggleRepaid(t)} onDelete={() => setToDelete(t)} />
              ))}
            </ul>
          )}
        </>
      )}

      {toDelete && (
        <ConfirmDialog
          title="Delete this entry?"
          confirmLabel="Delete"
          danger
          busy={busyId === toDelete.id}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setToDelete(null)}
        >
          {toDelete.customerName}, <Money value={toDelete.amount} /> on <DateText value={toDelete.txnDate} />.
          It is hidden from lists and totals, and you can undo it for 10 seconds. After that an admin can restore it.
        </ConfirmDialog>
      )}
    </section>
  );
}

function TransactionRow({ txn: t, canWrite, busy, onToggleRepaid, onDelete }: {
  txn: Transaction;
  canWrite: boolean;
  busy: boolean;
  onToggleRepaid: () => void;
  onDelete: () => void;
}) {
  const statusClass = t.repaidStatus === 'REPAID' ? 'badge badge-good' : 'badge badge-pending';
  return (
    <li className="txn card">
      <div className="txn-main">
        <div className="txn-who">
          <span className="txn-customer">{t.customerName}</span>
          <span className="muted txn-date"><DateText value={t.txnDate} /></span>
        </div>
        <div className="txn-figures">
          <span className="txn-amount"><Money value={t.amount} /></span>
          <span className="muted">at {formatPct(t.commissionRatePct)}% → <Money value={t.commission} /></span>
        </div>
        <div className="txn-status">
          {canWrite ? (
            <button type="button" className={statusClass} onClick={onToggleRepaid} disabled={busy}
              aria-label={`${REPAID_LABELS[t.repaidStatus]}. Mark as ${t.repaidStatus === 'PENDING' ? 'repaid' : 'pending'}`}>
              {REPAID_LABELS[t.repaidStatus]}
            </button>
          ) : (
            <span className={statusClass}>{REPAID_LABELS[t.repaidStatus]}</span>
          )}
        </div>
      </div>

      <details className="txn-details">
        <summary>Details</summary>
        <dl>
          {t.shares.map(s => (
            <div key={s.partnerId}>
              <dt>{s.partnerName} <span className="muted">({s.sharePct}%)</span></dt>
              <dd><Money value={s.earning} /></dd>
            </div>
          ))}
          {t.notes && <div><dt>Notes</dt><dd>{t.notes}</dd></div>}
          <div><dt>Added by</dt><dd>{t.createdBy}, <DateText value={t.createdAt} /></dd></div>
          {t.updatedAt !== t.createdAt && <div><dt>Last changed by</dt><dd>{t.updatedBy}, <DateText value={t.updatedAt} /></dd></div>}
        </dl>
        {canWrite && (
          <div className="txn-actions">
            <Link to={`/transactions/${t.id}/edit`} className="btn btn-ghost">Edit</Link>
            <button type="button" className="btn btn-ghost btn-danger-text" onClick={onDelete} disabled={busy}>Delete</button>
          </div>
        )}
      </details>
    </li>
  );
}
