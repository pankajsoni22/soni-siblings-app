import { useState } from 'react';
import { ApiError } from '../api/ApiError.ts';
import type { Partner } from '../api/types.ts';
import { useApi } from '../api/useApi.ts';
import { useQuery } from '../api/useQuery.ts';
import PageHeader from '../components/PageHeader.tsx';
import { ErrorState, Loading } from '../components/States.tsx';
import { useToast } from '../components/toastContext.ts';
import { activeTotalPct, moveRow, newRow, rowsFrom, validatePartners, type PartnerErrors, type PartnerRow } from '../lib/partnersForm.ts';

export default function PartnersPage() {
  const list = useQuery('partners', api => api.listPartners());
  return (
    <section>
      <PageHeader title="Partners" />
      {list.error && !list.data ? <div className="card"><ErrorState error={list.error} onRetry={list.reload} /></div>
        : !list.data ? <div className="card"><Loading /></div>
          // Remount with the saved list after each save, so the editor starts from the server's state.
          : <PartnersEditor key={list.data.map(p => p.updatedAt).join('|')} partners={list.data} onSaved={list.reload} />}
    </section>
  );
}

function PartnersEditor({ partners, onSaved }: { partners: Partner[]; onSaved: () => void }) {
  const api = useApi();
  const toast = useToast();
  const [rows, setRows] = useState<PartnerRow[]>(() => rowsFrom(partners));
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const validation = validatePartners(rows);
  const errors: PartnerErrors = submitted && !validation.ok ? validation.errors : {};
  const total = activeTotalPct(rows);
  const totalOk = total === 100;
  const comparable = (rs: PartnerRow[]) => JSON.stringify(rs.map(r => [r.id ?? null, r.name, r.pct, r.active]));
  const dirty = comparable(rows) !== comparable(rowsFrom(partners));

  const update = (key: string, patch: Partial<PartnerRow>) => {
    setRows(rs => rs.map(r => (r.key === key ? { ...r, ...patch } : r)));
    setServerError(null);
  };

  async function save() {
    setSubmitted(true);
    if (!validation.ok) return;
    setSaving(true);
    try {
      await api.savePartners(validation.input);
      toast('Partners saved. New entries use these default shares; past entries keep theirs.');
      onSaved();
    } catch (err) {
      if (!ApiError.is(err, 'AUTH_REQUIRED')) setServerError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card form">
      <p className="muted intro">
        Default shares are where every new entry starts; each entry can still be adjusted. Active partners' shares must add up to
        100%. Partners who leave are deactivated, never deleted, so past entries and reports stay correct.
      </p>

      <ul className="partner-list">
        {rows.map((r, i) => (
          <li key={r.key} className={`partner-row${r.active ? '' : ' partner-inactive'}`}>
            <div className="partner-fields">
              <label className="visually-hidden" htmlFor={`pn-${r.key}`}>Name</label>
              <input id={`pn-${r.key}`} type="text" value={r.name} maxLength={60} placeholder="Partner name"
                aria-invalid={Boolean(errors[r.key])} onChange={e => update(r.key, { name: e.target.value })} />
              <span className="share-input">
                <label className="visually-hidden" htmlFor={`pp-${r.key}`}>Default share for {r.name || 'this partner'}</label>
                <input id={`pp-${r.key}`} type="text" inputMode="decimal" value={r.pct} disabled={!r.active}
                  onChange={e => update(r.key, { pct: e.target.value })} />
                <span aria-hidden="true">%</span>
              </span>
            </div>
            <div className="partner-controls">
              <label className="switch">
                <input type="checkbox" checked={r.active} onChange={e => update(r.key, { active: e.target.checked })} />
                {r.active ? 'Active' : 'Inactive'}
              </label>
              <button type="button" className="icon-btn" aria-label={`Move ${r.name || 'partner'} up`} disabled={i === 0}
                onClick={() => setRows(rs => moveRow(rs, r.key, -1))}>↑</button>
              <button type="button" className="icon-btn" aria-label={`Move ${r.name || 'partner'} down`} disabled={i === rows.length - 1}
                onClick={() => setRows(rs => moveRow(rs, r.key, 1))}>↓</button>
              {!r.id && (
                <button type="button" className="icon-btn" aria-label="Discard this new partner"
                  onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))}>✕</button>
              )}
            </div>
            {errors[r.key] && <div className="field-error" role="alert">{errors[r.key]}</div>}
          </li>
        ))}
      </ul>

      <div className={`share-total${totalOk ? '' : ' share-total-bad'}`} aria-live="polite">
        <span>Active partners total</span>
        <span>{Number.isNaN(total) ? '—' : `${total}%`}</span>
      </div>
      {(errors._form ?? serverError) && <div className="banner banner-error" role="alert">{errors._form ?? serverError}</div>}

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={() => setRows(rs => [...rs, newRow()])}>Add partner</button>
        {dirty && <button type="button" className="btn btn-ghost" onClick={() => { setRows(rowsFrom(partners)); setSubmitted(false); }}>Undo changes</button>}
        <button type="button" className="btn" disabled={saving || !dirty || !totalOk} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save partners'}
        </button>
      </div>
    </div>
  );
}
