import { Check, ChevronRight, Clock3, Download, History, Pencil, Plus, Search, Trash2 } from 'lucide-react';
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
import HistoryDialog from '../components/HistoryDialog.tsx';
import Money from '../components/Money.tsx';
import PageHeader from '../components/PageHeader.tsx';
import PeriodPicker from '../components/PeriodPicker.tsx';
import { EmptyState, ErrorState, Loading } from '../components/States.tsx';
import { useToast } from '../components/toastContext.ts';
import { downloadCsv, partnerColumnsOf, transactionsToCsv } from '../lib/csv.ts';
import { periodFor, periodKeyFrom, todayIst } from '../lib/fy.ts';
import { formatINR, fromPaise, toPaise } from '../lib/money.ts';
import { partnerColor } from '../lib/partnerColors.ts';
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
  const isAdmin = can(me?.role, 'getHistory');
  const [historyOf, setHistoryOf] = useState<Transaction | null>(null);

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
      <PageHeader title="Transactions" subtitle={period.detail}>
        {isAdmin && <Link to="/transactions/deleted" className="btn btn-ghost"><Trash2 size={16} aria-hidden="true" /> Deleted</Link>}
        <button type="button" className="btn btn-ghost" onClick={exportCsv} disabled={!filtered.length}>
          <Download size={16} aria-hidden="true" /> Export
        </button>
        {canWrite && <Link to="/transactions/new" className="btn"><Plus size={17} aria-hidden="true" /> New entry</Link>}
      </PageHeader>

      <div className="filters">
        <PeriodPicker value={period} today={today} onChange={setPeriod} showDetail={false} />
        <span className="input-icon">
          <Search size={16} aria-hidden="true" />
          <label className="visually-hidden" htmlFor="txn-search">Search customer or notes</label>
          <input id="txn-search" type="search" placeholder="Search customer or notes" value={search} onChange={e => setSearch(e.target.value)} />
        </span>
        <div className="segmented" role="group" aria-label="Status">
          {(['ALL', 'PENDING', 'REPAID'] as const).map(s => (
            <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>
              {s === 'ALL' ? 'All' : REPAID_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {list.error && !list.data ? (
        <div className="card"><ErrorState error={list.error} onRetry={list.reload} /></div>
      ) : !list.data ? (
        <div className="card"><Loading /></div>
      ) : (
        <>
          <p className="summary" aria-live="polite">
            <b>{filtered.length.toLocaleString('en-IN')}</b> {filtered.length === 1 ? 'entry' : 'entries'} · lent <b><Money value={totals.lent} /></b> ·
            commission <b><Money value={totals.commission} /></b>
            {list.loading && ' · refreshing…'}
          </p>
          {filtered.length === 0 ? (
            <div className="card">
              <EmptyState title={rows.length ? 'Nothing matches the search' : 'No transactions in this period'}>
                {canWrite && !rows.length && <Link to="/transactions/new">Record a new entry</Link>}
              </EmptyState>
            </div>
          ) : (
            <div className="card txn-table">
              <div className="txn-head" aria-hidden="true">
                <span>Date</span><span>Customer</span><span>Amount</span><span>Rate</span><span>Commission</span><span>Status</span>
              </div>
              <ul className="txn-list">
                {filtered.map(t => (
                  <TransactionRow key={t.id} txn={t} canWrite={canWrite} busy={busyId === t.id}
                    onToggleRepaid={() => void toggleRepaid(t)} onDelete={() => setToDelete(t)}
                    onHistory={isAdmin ? () => setHistoryOf(t) : undefined} />
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {historyOf && <HistoryDialog txn={historyOf} onClose={() => setHistoryOf(null)} />}

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

function TransactionRow({ txn: t, canWrite, busy, onToggleRepaid, onDelete, onHistory }: {
  txn: Transaction;
  canWrite: boolean;
  /** Admins only. */
  onHistory?: () => void;
  busy: boolean;
  onToggleRepaid: () => void;
  onDelete: () => void;
}) {
  const repaid = t.repaidStatus === 'REPAID';
  const statusClass = repaid ? 'badge badge-good' : 'badge badge-pending';
  const StatusIcon = repaid ? Check : Clock3;
  return (
    <li className="txn">
      <div className="txn-main">
        <span className="txn-date"><DateText value={t.txnDate} /></span>
        <div className="txn-who">
          <span className="txn-customer">{t.customerName}</span>
          <span className="txn-date-mobile"><DateText value={t.txnDate} /></span>
        </div>
        <div className="txn-figures">
          <span className="txn-amount"><Money value={t.amount} /></span>
          <span className="txn-rate">{formatPct(t.commissionRatePct)}%</span>
          <span className="txn-comm"><span className="mobile-only">{formatPct(t.commissionRatePct)}% · </span><b>+<Money value={t.commission} /></b></span>
        </div>
        <div className="txn-status">
          {canWrite ? (
            <button type="button" className={statusClass} onClick={onToggleRepaid} disabled={busy}
              aria-label={`${REPAID_LABELS[t.repaidStatus]}. Mark as ${repaid ? 'pending' : 'repaid'}`}
              title={`Mark as ${repaid ? 'pending' : 'repaid'}`}>
              <StatusIcon size={13} aria-hidden="true" /> {REPAID_LABELS[t.repaidStatus]}
            </button>
          ) : (
            <span className={statusClass}><StatusIcon size={13} aria-hidden="true" /> {REPAID_LABELS[t.repaidStatus]}</span>
          )}
        </div>
      </div>

      <details className="txn-details">
        <summary><ChevronRight size={14} aria-hidden="true" /> Details</summary>
        <dl>
          {t.shares.map((s, i) => (
            <div key={s.partnerId}>
              <dt><span className="legend-dot" style={{ background: partnerColor(i) }} aria-hidden="true" />{s.partnerName} <span className="muted">({s.sharePct}%)</span></dt>
              <dd><Money value={s.earning} /></dd>
            </div>
          ))}
          {t.notes && <div><dt>Notes</dt><dd>{t.notes}</dd></div>}
          <div><dt>Added by</dt><dd>{t.createdBy}, <DateText value={t.createdAt} /></dd></div>
          {t.updatedAt !== t.createdAt && <div><dt>Last changed by</dt><dd>{t.updatedBy}, <DateText value={t.updatedAt} /></dd></div>}
        </dl>
        {(canWrite || onHistory) && (
          <div className="txn-actions">
            {onHistory && <button type="button" className="btn btn-ghost btn-sm" onClick={onHistory}><History size={15} aria-hidden="true" /> History</button>}
            {canWrite && <Link to={`/transactions/${t.id}/edit`} className="btn btn-ghost btn-sm"><Pencil size={15} aria-hidden="true" /> Edit</Link>}
            {canWrite && <button type="button" className="btn btn-ghost btn-sm btn-danger-text" onClick={onDelete} disabled={busy}><Trash2 size={15} aria-hidden="true" /> Delete</button>}
          </div>
        )}
      </details>
    </li>
  );
}
