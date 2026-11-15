import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Transaction } from '../api/types.ts';
import { useApi } from '../api/useApi.ts';
import { useQuery } from '../api/useQuery.ts';
import PageHeader from '../components/PageHeader.tsx';
import { ErrorState, Loading } from '../components/States.tsx';
import { dataStore } from '../data/store.ts';
import { useData } from '../data/useData.ts';
import TransactionForm from './TransactionForm.tsx';

const daysBefore = (date: string, days: number) =>
  new Date(Date.parse(date + 'T00:00:00Z') - days * 864e5).toISOString().slice(0, 10);

/**
 * Shows the form for /transactions/new and /transactions/:id/edit, from the local copy
 * (no server call). An entry that isn't in the copy (e.g. a link from before it synced) is
 * fetched. If someone else saved it meanwhile, saving reports a conflict and the copy is refreshed.
 */
export default function TransactionFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const api = useApi();
  const data = useData();
  const config = data.config;
  const local = id ? data.byId.get(id) : undefined;
  const fetched = useQuery<Transaction | null>(`txn:${id && !local && config ? id : 'none'}`,
    a => (id && !local && config ? a.getTransaction(id) : Promise.resolve(null)));
  const txn: Transaction | null | undefined = !id ? null : local ?? (fetched.loading ? undefined : fetched.data ?? undefined);

  // Customer names used in the last year, most frequent first, for suggestions while typing.
  const today = config?.today;
  const customers = useMemo(() => {
    if (!today) return [];
    const since = daysBefore(today, 365);
    const counts = new Map<string, number>();
    for (const t of data.txns) if (t.txnDate >= since) counts.set(t.customerName, (counts.get(t.customerName) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [data.txns, today]);

  const [formKey, setFormKey] = useState(0);
  const [keepDate, setKeepDate] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  const title = isEdit ? 'Edit entry' : 'New entry';
  const failed = (!config && data.error) || (isEdit && !local && fetched.error);
  if (failed) {
    return (
      <section>
        <PageHeader title={title} />
        <div className="card"><ErrorState error={failed} onRetry={() => { dataStore.sync(api).catch(() => {}); fetched.reload(); }} /></div>
      </section>
    );
  }
  if (!config || txn === undefined) {
    return <section><PageHeader title={title} /><div className="card"><Loading /></div></section>;
  }

  return (
    <section>
      <PageHeader title={title} />
      <TransactionForm
        key={`${txn?.updatedAt ?? 'new'}#${formKey}`}
        config={config}
        txn={txn}
        customers={customers}
        keepDate={keepDate}
        conflict={conflict}
        onConflict={() => { setConflict(true); dataStore.sync(api).catch(() => {}); }}
        onSavedAndAddAnother={date => { setKeepDate(date); setFormKey(k => k + 1); }}
      />
    </section>
  );
}
