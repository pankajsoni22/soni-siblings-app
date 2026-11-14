import { Check, Clock3, Equal, RotateCcw, TriangleAlert } from 'lucide-react';
import { useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/ApiError.ts';
import type { AppConfig, Transaction } from '../api/types.ts';
import { REPAID_LABELS } from '../api/types.ts';
import { useApi } from '../api/useApi.ts';
import ConfirmDialog from '../components/ConfirmDialog.tsx';
import FormField from '../components/FormField.tsx';
import Money from '../components/Money.tsx';
import { useToast } from '../components/toastContext.ts';
import { useUnsavedChangesWarning } from '../components/useUnsavedChangesWarning.ts';
import { describedBy } from '../lib/a11y.ts';
import { formatINR, parseNumber } from '../lib/money.ts';
import { partnerColor } from '../lib/partnerColors.ts';
import {
  fieldOfServerMessage, initialForm, previewOf, resetShares, sharesStatus, splitEqually, validateForm,
  type FieldName, type FormErrors, type FormState
} from '../lib/transactionForm.ts';

const FIELD_ORDER: FieldName[] = ['txnDate', 'customerName', 'amount', 'rate', 'shares', 'notes'];

export default function TransactionForm({ config, txn, customers, keepDate, conflict, onConflict, onSavedAndAddAnother }: {
  config: AppConfig;
  txn: Transaction | null;
  customers: string[];
  keepDate: string | null;
  conflict: boolean;
  onConflict: () => void;
  onSavedAndAddAnother: (date: string) => void;
}) {
  const api = useApi();
  const toast = useToast();
  const navigate = useNavigate();
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const formRef = useRef<HTMLFormElement>(null);

  const [form, setForm] = useState<FormState>(() => initialForm(config, txn, keepDate));
  const [initialJson] = useState(() => JSON.stringify(form));
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmRate, setConfirmRate] = useState<null | { addAnother: boolean }>(null);

  const validation = useMemo(() => validateForm(form, config.today), [form, config.today]);
  useUnsavedChangesWarning(!saving && JSON.stringify(form) !== initialJson);
  const errors: FormErrors = { ...(submitted && !validation.ok ? validation.errors : {}), ...serverErrors };
  const preview = previewOf(form);
  const shares = sharesStatus(form);
  const rate = parseNumber(form.rate);
  const rateHigh = rate !== null && rate > config.rateWarningAbovePct;
  const hasInactive = form.shares.some(s => !s.active);

  const update = (patch: Partial<FormState>) => {
    setForm(f => ({ ...f, ...patch }));
    setServerErrors({});
    setFormError(null);
  };
  const setShare = (partnerId: string, pct: string) =>
    update({ shares: form.shares.map(s => (s.partnerId === partnerId ? { ...s, pct } : s)) });

  function focusFirstError(errs: FormErrors) {
    const first = FIELD_ORDER.find(f => errs[f]);
    if (first) formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`)?.focus();
  }

  function submit(addAnother: boolean) {
    setSubmitted(true);
    if (!validation.ok) {
      focusFirstError(validation.errors);
      return;
    }
    if (rateHigh) setConfirmRate({ addAnother });
    else void save(addAnother);
  }

  async function save(addAnother: boolean) {
    if (!validation.ok) return;
    setConfirmRate(null);
    setSaving(true);
    try {
      const saved = txn
        ? await api.updateTransaction(txn.id, txn.updatedAt, validation.input, validation.shares)
        : await api.createTransaction(validation.input, validation.shares);
      toast(`Saved: ${formatINR(saved.amount)} to ${saved.customerName}, commission ${formatINR(saved.commission)}`);
      if (addAnother) onSavedAndAddAnother(saved.txnDate);
      else void navigate('/transactions');
    } catch (err) {
      if (ApiError.is(err, 'CONFLICT')) {
        toast(err.message, 'error');
        onConflict();
      } else if (ApiError.is(err, 'VALIDATION')) {
        const field = fieldOfServerMessage(err.message);
        if (field) {
          setServerErrors({ [field]: err.message });
          focusFirstError({ [field]: err.message });
        } else {
          setFormError(err.message);
        }
      } else if (!ApiError.is(err, 'AUTH_REQUIRED')) {
        // AUTH_REQUIRED opens the sign-in dialog; the form stays filled in and can be saved again.
        setFormError(err instanceof Error ? `${err.message}. Your entry is still here; try saving again.` : 'Could not save');
      }
    } finally {
      setSaving(false);
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(false);
  };


  const amount = parseNumber(form.amount);
  const colorOf = (partnerId: string, fallback: number) => {
    const i = config.partnerOrder.indexOf(partnerId);
    return partnerColor(i >= 0 ? i : fallback);
  };

  return (
    <>
      {conflict && txn && (
        <div className="banner" role="alert">
          <TriangleAlert size={18} aria-hidden="true" />
          <span>Someone else changed this entry while you were editing. You're now seeing their version; please apply your change again.</span>
        </div>
      )}

      <form ref={formRef} className="form-layout" onSubmit={onSubmit} noValidate>
        <div className="card">
          <div className="form-section-title"><h2>Loan details</h2></div>
          <div className="form-grid">
            <FormField id={id('date')} label="Transaction date" error={errors.txnDate}>
              <input id={id('date')} data-field="txnDate" type="date" value={form.txnDate} max={config.today}
                aria-describedby={describedBy(id('date'))} aria-invalid={Boolean(errors.txnDate)}
                onChange={e => update({ txnDate: e.target.value })} />
            </FormField>

            <FormField id={id('customer')} label="Customer name" error={errors.customerName}>
              <input id={id('customer')} data-field="customerName" type="text" value={form.customerName} maxLength={100}
                list={id('customers')} autoComplete="off" autoFocus={!txn} placeholder="Who is the loan for?"
                aria-describedby={describedBy(id('customer'))} aria-invalid={Boolean(errors.customerName)}
                onChange={e => update({ customerName: e.target.value })} />
              <datalist id={id('customers')}>
                {customers.map(c => <option key={c} value={c} />)}
              </datalist>
            </FormField>

            <FormField id={id('amount')} label="Amount lent" error={errors.amount}>
              <span className="input-affix">
                <span className="affix affix-left" aria-hidden="true">₹</span>
                <input id={id('amount')} data-field="amount" type="text" inputMode="decimal" value={form.amount}
                  placeholder="5,00,000" autoComplete="off"
                  aria-describedby={describedBy(id('amount'))} aria-invalid={Boolean(errors.amount)}
                  onChange={e => update({ amount: e.target.value })} />
              </span>
            </FormField>

            <FormField id={id('rate')} label="Commission rate" error={errors.rate}
              hint={rateHigh ? `Above ${config.rateWarningAbovePct}%: you'll be asked to confirm` : undefined}>
              <span className="input-affix">
                <input id={id('rate')} data-field="rate" type="text" inputMode="decimal" value={form.rate} autoComplete="off"
                  aria-describedby={describedBy(id('rate'))} aria-invalid={Boolean(errors.rate)}
                  onChange={e => update({ rate: e.target.value })} />
                <span className="affix affix-right" aria-hidden="true">%</span>
              </span>
            </FormField>
          </div>

          <div className="divider" />

          <div className="form-section-title">
            <h2 id={id('shares-title')}>Partner shares</h2>
            <div className="share-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => update({ shares: resetShares(form) })}>
                <RotateCcw size={14} aria-hidden="true" /> Defaults
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => update({ shares: splitEqually(form) })}>
                <Equal size={14} aria-hidden="true" /> Split equally
              </button>
            </div>
          </div>
          {form.shares.length === 0 && <p className="field-error">No active partners yet. An admin must add partners first.</p>}
          <div className="share-list" role="group" aria-labelledby={id('shares-title')} aria-describedby={`${id('shares')}-total`}>
            {form.shares.map((s, i) => (
              <div className="share-row" key={s.partnerId}>
                <span className="legend-dot" style={{ background: colorOf(s.partnerId, i) }} aria-hidden="true" />
                <label htmlFor={id(`share-${s.partnerId}`)} className="share-name">
                  {s.partnerName}{!s.active && <span className="muted"> (inactive)</span>}
                </label>
                <span className="input-affix share-input">
                  <input id={id(`share-${s.partnerId}`)} data-field={i === 0 ? 'shares' : undefined} type="text" inputMode="decimal"
                    value={s.pct} autoComplete="off" aria-invalid={Boolean(errors.shares)}
                    onChange={e => setShare(s.partnerId, e.target.value)} />
                  <span className="affix affix-right" aria-hidden="true">%</span>
                </span>
                <span className="share-earning"><Money value={preview?.earnings[i] ?? null} /></span>
              </div>
            ))}
          </div>
          <div id={`${id('shares')}-total`} className={`share-total${shares.ok ? '' : ' share-total-bad'}`} aria-live="polite">
            <span>{shares.ok ? <Check size={16} aria-hidden="true" /> : <TriangleAlert size={16} aria-hidden="true" />} Total</span>
            <span>{Number.isNaN(shares.totalPct) ? '—' : `${shares.totalPct}%`}{shares.message ? ` · ${shares.message}` : ''}</span>
          </div>
          {errors.shares && <div className="field-error" role="alert">{errors.shares}</div>}
          {hasInactive && <p className="field-hint">Inactive partners can keep their share on this older entry but can't be added to new ones.</p>}

          <div className="divider" />

          <fieldset className="fieldset-plain">
            <legend>Repaid status</legend>
            <div className="segmented segmented-lg">
              {(['PENDING', 'REPAID'] as const).map(st => (
                <label key={st} className={form.repaidStatus === st ? 'selected' : ''}>
                  <input type="radio" name={id('status')} value={st} checked={form.repaidStatus === st}
                    onChange={() => update({ repaidStatus: st })} />
                  {st === 'REPAID' ? <Check size={16} aria-hidden="true" /> : <Clock3 size={16} aria-hidden="true" />}
                  {REPAID_LABELS[st]}
                </label>
              ))}
            </div>
          </fieldset>

          <FormField id={id('notes')} label="Notes (optional)" error={errors.notes}>
            <textarea id={id('notes')} data-field="notes" value={form.notes} maxLength={500} placeholder="Anything worth remembering"
              aria-describedby={describedBy(id('notes'))} onChange={e => update({ notes: e.target.value })} />
          </FormField>

          {formError && <div className="banner banner-error" role="alert">{formError}</div>}
        </div>

        <aside className="form-aside" aria-label="Summary">
          <div className="card summary-card" aria-live="polite">
            <span className="stat-label">Commission</span>
            <div className="summary-big"><Money value={preview?.commission ?? null} /></div>
            <div className="summary-line"><span>Amount lent</span><b><Money value={amount} /></b></div>
            <div className="summary-line"><span>Rate</span><b>{rate !== null ? `${form.rate}%` : '—'}</b></div>
            {preview && preview.commission > 0 && (
              <>
                <div className="split-bar" aria-hidden="true" style={{ marginTop: 14 }}>
                  {form.shares.map((s, i) => (preview.earnings[i] ?? 0) > 0 && (
                    <span key={s.partnerId} className="split-seg" style={{ flexGrow: preview.earnings[i] ?? 0, flexBasis: 0, background: colorOf(s.partnerId, i) }} />
                  ))}
                </div>
                <ul className="legend-list">
                  {form.shares.map((s, i) => (
                    <li key={s.partnerId} className="legend-row">
                      <span className="legend-dot" style={{ background: colorOf(s.partnerId, i) }} aria-hidden="true" />
                      <span className="legend-name">{s.partnerName}</span>
                      <span className="legend-amount"><Money value={preview.earnings[i] ?? null} /></span>
                      <span className="legend-share">{s.pct || 0}%</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="form-actions form-actions-sticky">
            <Link to="/transactions" className="btn btn-ghost">Cancel</Link>
            {!txn && (
              <button type="button" className="btn btn-ghost" disabled={saving || !shares.ok} onClick={() => submit(true)}>
                <span className="only-wide">Save and add another</span><span className="only-narrow">Save &amp; new</span>
              </button>
            )}
            <button type="submit" className="btn" disabled={saving || !shares.ok}>
              <Check size={17} aria-hidden="true" /> {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </aside>
      </form>

      {confirmRate && (
        <ConfirmDialog
          title={`Save with a ${form.rate}% rate?`}
          confirmLabel="Yes, save"
          busy={saving}
          onConfirm={() => void save(confirmRate.addAnother)}
          onCancel={() => setConfirmRate(null)}
        >
          That's above the usual {config.rateWarningAbovePct}%. Check it isn't a typing mistake.
        </ConfirmDialog>
      )}
    </>
  );
}
