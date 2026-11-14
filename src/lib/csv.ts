import type { Transaction } from '../api/types.ts';
import { REPAID_LABELS } from '../api/types.ts';

/**
 * CSV export of transactions, one row each, with a column per partner. Opens directly in Excel:
 * UTF-8 with a byte-order mark (so ₹ shows correctly), CRLF line endings, and text that Excel
 * would run as a formula (= + - @ at the start) prefixed with an apostrophe.
 */

export interface CsvPartnerColumn {
  partnerId: string;
  name: string;
}

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Partner columns in the order given; earnings of partners not on a transaction are left blank. */
export function transactionsToCsv(txns: readonly Transaction[], partners: readonly CsvPartnerColumn[]): string {
  const header = [
    'Date', 'Customer', 'Amount (₹)', 'Rate (%)', 'Commission (₹)', 'Status', 'Notes',
    ...partners.map(p => `${p.name} (₹)`),
    'Created by', 'Created at', 'Last changed by', 'Last changed at'
  ];
  const rows = txns.map(t => {
    const earning = new Map(t.shares.map(s => [s.partnerId, s.earning]));
    return [
      t.txnDate, t.customerName, t.amount, t.commissionRatePct, t.commission, REPAID_LABELS[t.repaidStatus], t.notes,
      ...partners.map(p => earning.get(p.partnerId)),
      t.createdBy, t.createdAt, t.updatedBy, t.updatedAt
    ];
  });
  return '﻿' + [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Every partner who appears on any of the transactions, in first-seen order. */
export function partnerColumnsOf(txns: readonly Transaction[]): CsvPartnerColumn[] {
  const seen = new Map<string, string>();
  for (const t of txns) for (const s of t.shares) if (!seen.has(s.partnerId)) seen.set(s.partnerId, s.partnerName);
  return [...seen].map(([partnerId, name]) => ({ partnerId, name }));
}

/** Starts a download of the CSV in the browser. */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
