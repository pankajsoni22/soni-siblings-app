import { useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Transaction } from '../api/types.ts';
import { useQuery } from '../api/useQuery.ts';
import PageHeader from '../components/PageHeader.tsx';
import { ErrorState, Loading } from '../components/States.tsx';
import TransactionForm from './TransactionForm.tsx';

const daysBefore = (date: string, days: number) =>
  new Date(Date.parse(date + 'T00:00:00Z') - days * 864e5).toISOString().slice(0, 10);

/** Loads what the form needs, then shows it. Used for both /transactions/new and /transactions/:id/edit. */
export default function TransactionFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const config = useQuery('config', api => api.getConfig());
  const txn = useQuery<Transaction | null>(`txn:${id ?? 'new'}`, api => (id ? api.getTransaction(id) : Promise.resolve(null)));

  // Customer names used in the last year, most frequent first, for suggestions while typing.
  const today = config.data?.today;
  const customers = useQuery(`customers:${today ?? ''}`, async api => {
    if (!today) return [];
    const recent = await api.listTransactions(daysBefore(today, 365), today);
    const counts = new Map<string, number>();
    for (const t of recent) counts.set(t.customerName, (counts.get(t.customerName) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  });

  const [formKey, setFormKey] = useState(0);
  const [keepDate, setKeepDate] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  const title = isEdit ? 'Edit entry' : 'New entry';
  const failed = config.error ?? txn.error;
  if (failed) {
    return (
      <section>
        <PageHeader title={title} />
        <div className="card"><ErrorState error={failed} onRetry={() => { config.reload(); txn.reload(); }} /></div>
      </section>
    );
  }
  if (!config.data || txn.data === undefined) {
    return <section><PageHeader title={title} /><div className="card"><Loading /></div></section>;
  }

  return (
    <section>
      <PageHeader title={title} />
      <TransactionForm
        key={`${txn.data?.updatedAt ?? 'new'}#${formKey}`}
        config={config.data}
        txn={txn.data}
        customers={customers.data ?? []}
        keepDate={keepDate}
        conflict={conflict}
        onConflict={() => { setConflict(true); txn.reload(); }}
        onSavedAndAddAnother={date => { setKeepDate(date); setFormKey(k => k + 1); }}
      />
    </section>
  );
}
