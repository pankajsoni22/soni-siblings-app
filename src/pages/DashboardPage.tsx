import { Download, Hourglass, IndianRupee, Percent, Plus, ReceiptText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi } from '../api/useApi.ts';
import { can } from '../auth/permissions.ts';
import { useAuth } from '../auth/useAuth.ts';
import Delta from '../components/charts/Delta.tsx';
import TrendChart from '../components/charts/TrendChart.tsx';
import PartnerEarnings from '../components/charts/PartnerEarnings.tsx';
import RecentEntries from '../components/charts/RecentEntries.tsx';
import StatCard from '../components/charts/StatCard.tsx';
import Money from '../components/Money.tsx';
import PageHeader from '../components/PageHeader.tsx';
import PeriodPicker from '../components/PeriodPicker.tsx';
import { EmptyState, ErrorState, Loading } from '../components/States.tsx';
import { downloadCsv, partnerColumnsOf, transactionsToCsv } from '../lib/csv.ts';
import { bucketize, chartRange, defaultGrain, grainsFor, type Grain } from '../lib/buckets.ts';
import { comparisonFor, formatShortDate, percentChange, periodFor, periodKeyFrom, todayIst } from '../lib/fy.ts';
import { formatINR } from '../lib/money.ts';
import { computeReport, transactionsIn } from '../lib/report.ts';
import { dataStore } from '../data/store.ts';
import { useData } from '../data/useData.ts';

export default function DashboardPage() {
  const api = useApi();
  const { me } = useAuth();
  const [searchParams] = useSearchParams();
  const [today] = useState(todayIst);
  const [period, setPeriod] = useState(() => periodFor(periodKeyFrom(searchParams.get('period'), 'thisMonth'), today));
  const prev = comparisonFor(period, today);

  // Everything comes from the local copy (src/data/store.ts): changing the period needs no server call.
  const data = useData();
  const loaded = data.config !== null;
  const txns = useMemo(() => transactionsIn(data.txns, period.from, period.to), [data.txns, period.from, period.to]);
  const r = useMemo(() => (loaded ? computeReport(data.txns, period.from, period.to, data.partners) : undefined),
    [loaded, data.txns, data.partners, period.from, period.to]);
  const prevFrom = prev?.from, prevTo = prev?.to;
  const p = useMemo(() => (loaded && prevFrom && prevTo ? computeReport(data.txns, prevFrom, prevTo, data.partners).totals : undefined),
    [loaded, data.txns, data.partners, prevFrom, prevTo]);

  // Chart grouping: the default suits the range; a choice sticks until the range changes.
  const range = useMemo(() => chartRange(period.from, period.to, txns), [period.from, period.to, txns]);
  const grains = grainsFor(range.from, range.to);
  const [grainChoice, setGrainChoice] = useState<{ range: string; grain: Grain } | null>(null);
  const rangeKey = `${range.from}:${range.to}`;
  const grain = grainChoice?.range === rangeKey && grains.includes(grainChoice.grain) ? grainChoice.grain : defaultGrain(range.from, range.to);
  const buckets = useMemo(() => bucketize(txns, range.from, range.to, grain), [txns, range.from, range.to, grain]);

  function exportCsv() {
    downloadCsv(`transactions_${period.from}_${period.to}.csv`, transactionsToCsv(txns, partnerColumnsOf(txns)));
  }

  /** "↑ 12% vs last month", or the fallback when the previous period has nothing to compare with. */
  const compare = (now: number, then: number | undefined, fallback: string | null = null) => {
    const c = then === undefined || !prev ? null : percentChange(now, then);
    return c === null || !prev ? fallback : <><Delta change={c} /> <span>{prev.label}</span></>;
  };
  const periodQuery = period.key !== 'custom' ? `?period=${period.key}` : '';

  return (
    <section>
      <PageHeader title={`Hello, ${(me?.name ?? '').split(' ')[0] || 'there'}`} subtitle="Here's how the business is doing.">
        <PeriodPicker value={period} today={today} onChange={setPeriod} showDetail={false} />
        <button type="button" className="btn btn-ghost" onClick={exportCsv} disabled={!txns.length}>
          <Download size={16} aria-hidden="true" /> Export
        </button>
        {can(me?.role, 'saveTransaction') && (
          <Link to="/transactions/new" className="btn"><Plus size={17} aria-hidden="true" /> New entry</Link>
        )}
      </PageHeader>

      {data.error && !r ? (
        <div className="card"><ErrorState error={data.error} onRetry={() => { dataStore.sync(api).catch(() => {}); }} /></div>
      ) : !r ? (
        <div className="card"><Loading /></div>
      ) : (
        <div className="dashboard">
          <div className="card hero">
            <span className="hero-label">Commission earned · {period.label}</span>
            <span className="hero-value">{formatINR(r.totals.commission)}</span>
            <span className="hero-meta">
              {compare(r.totals.commission, p?.commission)}
              <span>{period.detail}</span>
            </span>
          </div>

          <div className="stat-grid">
            <StatCard icon={IndianRupee} label="Total lent" value={<Money value={r.totals.lent} />}
              foot={compare(r.totals.lent, p?.lent, period.detail)} />
            <StatCard icon={ReceiptText} label="Entries" value={r.totals.count.toLocaleString('en-IN')}
              foot={compare(r.totals.count, p?.count, 'Loans recorded')} />
            <StatCard icon={Percent} label="Average rate" value={r.totals.averageRatePct === null ? '—' : `${r.totals.averageRatePct}%`}
              foot="Commission ÷ amount lent" />
            <StatCard icon={Hourglass} label="Pending repayment" value={<Money value={r.totals.pendingAmount} />}
              foot={`${r.totals.pendingCount} ${r.totals.pendingCount === 1 ? 'entry' : 'entries'} not yet repaid`} />
          </div>

          <div className="dash-grid">
            <div className="area-chart">
              {txns.length > 0 && (
                <TrendChart buckets={buckets} grain={grain} grains={grains}
                  onGrainChange={g => setGrainChoice({ range: rangeKey, grain: g })}
                  subtitle={period.key === 'allTime' ? `${formatShortDate(range.from)} – ${formatShortDate(range.to)}` : period.detail} />
              )}
            </div>
            <div className="card area-partners">
              <div className="card-head">
                <div>
                  <h2>Earnings by partner</h2>
                  <p className="card-sub">{period.detail}</p>
                </div>
              </div>
              {r.byPartner.length ? <PartnerEarnings rows={r.byPartner} total={r.totals.commission} />
                : <EmptyState title="No partners yet">An admin adds partners on the Partners page.</EmptyState>}
            </div>
            <div className="area-recent">
              <RecentEntries txns={txns} periodQuery={periodQuery} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
