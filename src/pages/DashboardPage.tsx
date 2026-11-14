import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/ApiError.ts';
import { useApi } from '../api/useApi.ts';
import { useQuery } from '../api/useQuery.ts';
import { can } from '../auth/permissions.ts';
import { useAuth } from '../auth/useAuth.ts';
import MonthlyChart from '../components/charts/MonthlyChart.tsx';
import PartnerEarnings from '../components/charts/PartnerEarnings.tsx';
import Money from '../components/Money.tsx';
import PageHeader from '../components/PageHeader.tsx';
import PeriodPicker from '../components/PeriodPicker.tsx';
import { EmptyState, ErrorState, Loading } from '../components/States.tsx';
import { useToast } from '../components/toastContext.ts';
import { downloadCsv, partnerColumnsOf, transactionsToCsv } from '../lib/csv.ts';
import { periodFor, periodKeyFrom, todayIst } from '../lib/fy.ts';
import { formatINR } from '../lib/money.ts';

export default function DashboardPage() {
  const api = useApi();
  const toast = useToast();
  const { me } = useAuth();
  const [searchParams] = useSearchParams();
  const [today] = useState(todayIst);
  const [period, setPeriod] = useState(() => periodFor(periodKeyFrom(searchParams.get('period'), 'thisMonth'), today));
  const report = useQuery(`report:${period.from}:${period.to}`, a => a.report(period.from, period.to));
  const [exporting, setExporting] = useState(false);

  async function exportCsv() {
    setExporting(true);
    try {
      const txns = await api.listTransactions(period.from, period.to);
      downloadCsv(`transactions_${period.from}_${period.to}.csv`, transactionsToCsv(txns, partnerColumnsOf(txns)));
    } catch (err) {
      if (!ApiError.is(err, 'AUTH_REQUIRED')) toast(err instanceof Error ? err.message : 'Export failed', 'error');
    } finally {
      setExporting(false);
    }
  }

  const r = report.data;
  return (
    <section>
      <PageHeader title="Dashboard">
        {can(me?.role, 'saveTransaction') && <Link to="/transactions/new" className="btn">New entry</Link>}
      </PageHeader>

      <div className="toolbar">
        <PeriodPicker value={period} today={today} onChange={setPeriod} />
        <button type="button" className="btn btn-ghost" onClick={() => void exportCsv()} disabled={exporting || !r?.totals.count}>
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      {report.error && !r ? (
        <div className="card"><ErrorState error={report.error} onRetry={report.reload} /></div>
      ) : !r ? (
        <div className="card"><Loading /></div>
      ) : (
        <div className={`dashboard${report.loading ? ' is-refreshing' : ''}`} aria-busy={report.loading}>
          <div className="card hero">
            <span className="stat-label">Commission earned</span>
            <span className="hero-value">{formatINR(r.totals.commission)}</span>
            <span className="muted">{period.detail}</span>
          </div>

          <div className="stat-row">
            <Stat label="Total lent" value={<Money value={r.totals.lent} />} />
            <Stat label="Entries" value={String(r.totals.count)} />
            <Stat label="Average rate" value={r.totals.averageRatePct === null ? '—' : `${r.totals.averageRatePct}%`} />
            <Stat label="Pending repayment" value={<Money value={r.totals.pendingAmount} />}
              note={`${r.totals.pendingCount} ${r.totals.pendingCount === 1 ? 'entry' : 'entries'}`} />
          </div>

          <div className="card">
            <h2>Earnings by partner</h2>
            {r.byPartner.length ? <PartnerEarnings rows={r.byPartner} total={r.totals.commission} />
              : <EmptyState title="No partners yet">An admin adds partners on the Partners page.</EmptyState>}
          </div>

          {r.byMonth.length > 1 && (
            <div className="card">
              <MonthlyChart months={r.byMonth} />
            </div>
          )}

          {r.totals.count === 0 && (
            <p className="muted">No entries in this period yet.</p>
          )}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="card stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {note && <span className="muted stat-note">{note}</span>}
    </div>
  );
}
