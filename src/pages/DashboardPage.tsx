import { useState } from 'react';
import { ROLE_LABELS } from '../api/types.ts';
import { useAuth } from '../auth/useAuth.ts';
import PageHeader from '../components/PageHeader.tsx';
import PeriodPicker from '../components/PeriodPicker.tsx';
import { EmptyState } from '../components/States.tsx';
import { periodFor, todayIst } from '../lib/fy.ts';

export default function DashboardPage() {
  const { me } = useAuth();
  const [today] = useState(todayIst);
  const [period, setPeriod] = useState(() => periodFor('thisMonth', today));

  return (
    <section>
      <PageHeader title="Dashboard">
        <PeriodPicker value={period} today={today} onChange={setPeriod} />
      </PageHeader>
      <p className="muted">
        Signed in as {me?.name} · {me ? ROLE_LABELS[me.role] : ''}{me?.isOwner ? ' (owner)' : ''}
      </p>
      <div className="card">
        <EmptyState title="Figures arrive in phase 4">
          Total lent, commission, pending repayments, earnings by partner and month by month for {period.from} to {period.to}.
        </EmptyState>
      </div>
    </section>
  );
}
