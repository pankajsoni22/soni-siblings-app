import type { Partner, PartnerInput } from '../api/types.ts';
import { hasMaxDecimals, parseNumber, sharesTotalPct } from './money.ts';
import { formatPct } from './transactionForm.ts';

/**
 * The Partners screen edits the whole list and saves it at once, so the 100% rule is checked
 * on the final state (the server checks it again). Partners are never removed, only
 * deactivated; rows added in this session can be discarded before saving.
 */

export interface PartnerRow {
  /** Stable React key: the partner id, or a temporary key for a new row. */
  key: string;
  id?: string;
  name: string;
  pct: string;
  active: boolean;
}

export function rowsFrom(partners: readonly Partner[]): PartnerRow[] {
  return partners.map(p => ({ key: p.id, id: p.id, name: p.name, pct: formatPct(p.defaultSharePct), active: p.active }));
}

let newCounter = 0;
export function newRow(): PartnerRow {
  newCounter += 1;
  return { key: `new-${newCounter}`, name: '', pct: '0', active: true };
}

export function moveRow(rows: readonly PartnerRow[], key: string, delta: -1 | 1): PartnerRow[] {
  const i = rows.findIndex(r => r.key === key);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= rows.length) return rows.slice();
  const out = rows.slice();
  const a = out[i], b = out[j];
  if (a && b) { out[i] = b; out[j] = a; }
  return out;
}

/** Total of active partners' default shares, exact to 2 decimals; NaN if any is unreadable. */
export function activeTotalPct(rows: readonly PartnerRow[]): number {
  const pcts = rows.filter(r => r.active).map(r => parseNumber(r.pct));
  if (pcts.some(p => p === null)) return Number.NaN;
  return sharesTotalPct(pcts as number[]);
}

export type PartnerErrors = Record<string, string>;

/** Field errors by row key (plus '_form' for list-wide problems), or the payload to save. */
export function validatePartners(rows: readonly PartnerRow[]):
  { ok: true; input: PartnerInput[] } | { ok: false; errors: PartnerErrors } {
  const errors: PartnerErrors = {};
  const seen = new Map<string, string>();

  for (const r of rows) {
    const name = r.name.trim();
    const pct = parseNumber(r.pct);
    if (!name) errors[r.key] = 'Enter a name';
    else if (name.length > 60) errors[r.key] = 'Use at most 60 characters';
    else if (seen.has(name.toLowerCase())) errors[r.key] = `Another partner is already named "${name}"`;
    else if (pct === null || pct > 100) errors[r.key] = 'Default share must be a number from 0 to 100';
    else if (!hasMaxDecimals(pct, 2)) errors[r.key] = 'Use at most 2 decimal places';
    if (name) seen.set(name.toLowerCase(), r.key);
  }

  const active = rows.filter(r => r.active);
  if (!rows.length) errors._form = 'Add at least one partner';
  else if (!active.length) errors._form = 'At least one partner must be active';
  else {
    const total = activeTotalPct(rows);
    if (!Number.isNaN(total) && total !== 100) errors._form = `Default shares of active partners add up to ${total}%; they must total 100%`;
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    input: rows.map(r => ({ ...(r.id ? { id: r.id } : {}), name: r.name.trim(), defaultSharePct: parseNumber(r.pct) ?? 0, active: r.active }))
  };
}
