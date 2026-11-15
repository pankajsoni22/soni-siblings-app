import { useState, type FormEvent } from 'react';
import { ApiError } from '../api/ApiError.ts';
import type { AppConfig } from '../api/types.ts';
import { useApi } from '../api/useApi.ts';
import FormField from '../components/FormField.tsx';
import PageHeader from '../components/PageHeader.tsx';
import { ErrorState, Loading } from '../components/States.tsx';
import { useToast } from '../components/toastContext.ts';
import { dataStore } from '../data/store.ts';
import { useData } from '../data/useData.ts';
import { describedBy } from '../lib/a11y.ts';
import { hasMaxDecimals, parseNumber } from '../lib/money.ts';
import { formatPct } from '../lib/transactionForm.ts';

export default function SettingsPage() {
  const api = useApi();
  const { config, error } = useData();   // from the local copy; saving refreshes it
  return (
    <section>
      <PageHeader title="Settings" subtitle="Defaults used when recording new entries." />
      {error && !config ? <div className="card"><ErrorState error={error} onRetry={() => { dataStore.sync(api).catch(() => {}); }} /></div>
        : !config ? <div className="card"><Loading /></div>
          : <RateForm key={config.defaultCommissionRatePct} config={config} />}
    </section>
  );
}

function rateError(input: string): string | null {
  const n = parseNumber(input);
  if (input.trim() === '' || n === null) return 'Enter a rate like 0.30';
  if (!(n > 0 && n < 100)) return 'The rate must be more than 0% and less than 100%';
  if (!hasMaxDecimals(n, 4)) return 'Use at most 4 decimal places';
  return null;
}

function RateForm({ config }: { config: AppConfig }) {
  const api = useApi();
  const toast = useToast();
  const [rate, setRate] = useState(formatPct(config.defaultCommissionRatePct));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const unchanged = parseNumber(rate) === config.defaultCommissionRatePct;

  async function save(e: FormEvent) {
    e.preventDefault();
    const problem = rateError(rate);
    if (problem) { setError(problem); return; }
    setSaving(true);
    try {
      const saved = await api.saveSettings(parseNumber(rate) ?? 0);
      toast(`Default commission rate is now ${formatPct(saved.defaultCommissionRatePct)}%`);
    } catch (err) {
      if (!ApiError.is(err, 'AUTH_REQUIRED')) setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card" style={{ maxWidth: 560 }} onSubmit={e => void save(e)} noValidate>
      <FormField id="default-rate" label="Default commission rate (%)" error={error}
        hint="New entries start with this rate; it can be changed on each entry. Existing entries keep their rate.">
        <input id="default-rate" type="text" inputMode="decimal" value={rate} autoComplete="off"
          aria-describedby={describedBy('default-rate')} aria-invalid={Boolean(error)}
          onChange={e => { setRate(e.target.value); setError(null); }} />
      </FormField>
      <p className="muted">
        Rates above {config.rateWarningAbovePct}% ask "Are you sure?" before saving, to catch typing mistakes.
      </p>
      <div className="form-actions">
        <button type="submit" className="btn" disabled={saving || unchanged}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  );
}
