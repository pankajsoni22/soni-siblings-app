import type { AppConfig, RepaidStatus, ShareInput, Transaction, TransactionInput } from '../api/types.ts';
import { equalSharesPct, hasMaxDecimals, parseNumber, previewSplit, sharesTotalPct } from './money.ts';

/**
 * The transaction form's state and rules, kept free of React so they can be tested.
 * Number fields hold what the user typed (strings); they are parsed on validation.
 */

export interface ShareRow {
  partnerId: string;
  partnerName: string;
  /** False for a partner who has since been deactivated but is on this (old) transaction. */
  active: boolean;
  defaultSharePct: number;
  pct: string;
}

export interface FormState {
  txnDate: string;
  customerName: string;
  amount: string;
  rate: string;
  repaidStatus: RepaidStatus;
  notes: string;
  /** In partner order (config.partnerOrder), which decides who takes a leftover paisa. */
  shares: ShareRow[];
}

export type FieldName = 'txnDate' | 'customerName' | 'amount' | 'rate' | 'notes' | 'shares';
export type FormErrors = Partial<Record<FieldName, string>>;

export const MAX_AMOUNT = 1_000_000_000;

/** 0.3 → "0.30", 0.275 → "0.275", 40 → "40" */
export function formatPct(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return hasMaxDecimals(n, 2) ? n.toFixed(2) : String(n);
}

/** 500000 → "5,00,000", 1234.5 → "1,234.50" */
export function formatAmountInput(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
}

function orderShares(rows: ShareRow[], partnerOrder: readonly string[]): ShareRow[] {
  const pos = (id: string) => {
    const i = partnerOrder.indexOf(id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return rows.slice().sort((a, b) => pos(a.partnerId) - pos(b.partnerId));
}

/**
 * A new form (no `txn`) starts from today and the admin's defaults. An edit form shows the
 * transaction as saved: its own shares (inactive partners included), plus any active partner
 * who wasn't on it, at 0%.
 */
export function initialForm(config: AppConfig, txn?: Transaction | null, keepDate?: string | null): FormState {
  if (!txn) {
    return {
      txnDate: keepDate ?? config.today,
      customerName: '',
      amount: '',
      rate: formatPct(config.defaultCommissionRatePct),
      repaidStatus: 'PENDING',
      notes: '',
      shares: orderShares(config.partners.map(p => ({
        partnerId: p.id, partnerName: p.name, active: true, defaultSharePct: p.defaultSharePct, pct: formatPct(p.defaultSharePct)
      })), config.partnerOrder)
    };
  }
  const activeById = new Map(config.partners.map(p => [p.id, p]));
  const rows: ShareRow[] = txn.shares.map(s => ({
    partnerId: s.partnerId,
    partnerName: s.partnerName,
    active: activeById.has(s.partnerId),
    defaultSharePct: activeById.get(s.partnerId)?.defaultSharePct ?? 0,
    pct: formatPct(s.sharePct)
  }));
  for (const p of config.partners) {
    if (!rows.some(r => r.partnerId === p.id)) {
      rows.push({ partnerId: p.id, partnerName: p.name, active: true, defaultSharePct: p.defaultSharePct, pct: '0' });
    }
  }
  return {
    txnDate: txn.txnDate,
    customerName: txn.customerName,
    amount: formatAmountInput(txn.amount),
    rate: formatPct(txn.commissionRatePct),
    repaidStatus: txn.repaidStatus,
    notes: txn.notes ?? '',
    shares: orderShares(rows, config.partnerOrder)
  };
}

/** Each partner's share as a number; blank counts as 0, anything unreadable as NaN. */
export function sharePcts(form: FormState): number[] {
  return form.shares.map(s => (s.pct.trim() === '' ? 0 : parseNumber(s.pct) ?? Number.NaN));
}

/** Admin defaults for active partners, 0 for inactive ones. */
export function resetShares(form: FormState): ShareRow[] {
  return form.shares.map(s => ({ ...s, pct: formatPct(s.active ? s.defaultSharePct : 0) }));
}

/** Equal split among active partners (33.33 / 33.33 / 33.34), 0 for inactive ones. */
export function splitEqually(form: FormState): ShareRow[] {
  const equal = equalSharesPct(form.shares.filter(s => s.active).length);
  let i = 0;
  return form.shares.map(s => ({ ...s, pct: s.active ? formatPct(equal[i++] ?? 0) : '0' }));
}

export interface SharesStatus {
  totalPct: number;
  ok: boolean;
  /** "5% left" / "5% too much" when not 100. */
  message: string | null;
}

export function sharesStatus(form: FormState): SharesStatus {
  const pcts = sharePcts(form);
  if (pcts.some(p => Number.isNaN(p))) return { totalPct: Number.NaN, ok: false, message: 'Check the shares: use numbers like 33.33' };
  const totalPct = sharesTotalPct(pcts);
  if (totalPct === 100) return { totalPct, ok: true, message: null };
  const gap = Math.round(Math.abs(100 - totalPct) * 100) / 100;
  return { totalPct, ok: false, message: totalPct < 100 ? `${gap}% left to assign` : `${gap}% too much` };
}

/** Live commission and earnings for the screen, or null until amount and rate are readable. */
export function previewOf(form: FormState): { commission: number; earnings: (number | null)[] } | null {
  const amount = parseNumber(form.amount);
  const rate = parseNumber(form.rate);
  if (amount === null || rate === null || amount <= 0 || rate <= 0 || rate >= 100) return null;
  const pcts = sharePcts(form);
  const usable = pcts.map(p => (Number.isNaN(p) ? 0 : p));
  const { commission, earnings } = previewSplit(amount, rate, usable);
  return { commission, earnings: earnings.map((e, i) => (Number.isNaN(pcts[i] ?? Number.NaN) ? null : e)) };
}

/**
 * Checks the form the way the server will. Returns field errors, or the payload to send.
 * The server re-checks everything; this is only so people see problems before saving.
 */
export function validateForm(form: FormState, today: string):
  { ok: true; input: TransactionInput; shares: ShareInput[] } | { ok: false; errors: FormErrors } {
  const errors: FormErrors = {};

  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.txnDate)) errors.txnDate = 'Choose a date';
  else if (form.txnDate > today) errors.txnDate = "The date can't be in the future";

  const customerName = form.customerName.trim();
  if (!customerName) errors.customerName = 'Enter the customer name';
  else if (customerName.length > 100) errors.customerName = 'Use at most 100 characters';

  const amount = parseNumber(form.amount);
  if (form.amount.trim() === '') errors.amount = 'Enter the amount lent';
  else if (amount === null) errors.amount = 'Enter an amount like 5,00,000 or 1234.50';
  else if (amount <= 0) errors.amount = 'The amount must be more than ₹0';
  else if (amount > MAX_AMOUNT) errors.amount = 'The amount must be at most ₹100 crore';
  else if (!hasMaxDecimals(amount, 2)) errors.amount = 'Use at most 2 decimal places (paise)';

  const rate = parseNumber(form.rate);
  if (form.rate.trim() === '') errors.rate = 'Enter the commission rate';
  else if (rate === null) errors.rate = 'Enter a rate like 0.30';
  else if (!(rate > 0 && rate < 100)) errors.rate = 'The rate must be more than 0% and less than 100%';
  else if (!hasMaxDecimals(rate, 4)) errors.rate = 'Use at most 4 decimal places';

  if (form.notes.length > 500) errors.notes = 'Use at most 500 characters';

  const pcts = sharePcts(form);
  const status = sharesStatus(form);
  if (pcts.some(p => Number.isNaN(p) || p < 0 || p > 100)) errors.shares = 'Each share must be a number from 0 to 100';
  else if (pcts.some(p => !hasMaxDecimals(p, 2))) errors.shares = 'Use at most 2 decimal places for shares';
  else if (!status.ok) errors.shares = `Shares add up to ${status.totalPct}%; they must total 100%`;

  if (Object.keys(errors).length || amount === null || rate === null) return { ok: false, errors };
  return {
    ok: true,
    input: { txnDate: form.txnDate, customerName, amount, commissionRatePct: rate, repaidStatus: form.repaidStatus, notes: form.notes.trim() },
    shares: form.shares.map((s, i) => ({ partnerId: s.partnerId, sharePct: pcts[i] ?? 0 }))
  };
}

/**
 * Server validation messages start with the field name ("amount must have at most 2 decimal
 * places"); this says which form field to show such a message beside.
 */
export function fieldOfServerMessage(message: string): FieldName | null {
  const first = message.split(/\s/, 1)[0] ?? '';
  const map: Record<string, FieldName> = {
    txnDate: 'txnDate', customerName: 'customerName', amount: 'amount', commissionRatePct: 'rate',
    notes: 'notes', sharePct: 'shares', Shares: 'shares', '"shares"': 'shares', Partner: 'shares'
  };
  return map[first] ?? null;
}
