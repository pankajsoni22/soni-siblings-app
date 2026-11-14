import type { HistoryEntry } from '../api/types.ts';
import { REPAID_LABELS } from '../api/types.ts';
import { formatShortDate } from './fy.ts';
import { formatINR } from './money.ts';
import { formatPct } from './transactionForm.ts';

/** Turns audit-log entries for a transaction into plain sentences for the History view. */

const ACTION_LABELS: Record<HistoryEntry['action'], string> = {
  create: 'Created',
  update: 'Changed',
  delete: 'Deleted',
  restore: 'Restored'
};

const FIELD_LABELS: Record<string, string> = {
  txnDate: 'Date',
  customerName: 'Customer',
  amount: 'Amount',
  commissionRatePct: 'Rate',
  commission: 'Commission',
  repaidStatus: 'Status',
  notes: 'Notes'
};

interface ShareSummary { partnerName?: string; sharePct?: number; earning?: number }

function show(field: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '(empty)';
  if ((field === 'amount' || field === 'commission') && typeof v === 'number') return formatINR(v);
  if (field === 'commissionRatePct' && typeof v === 'number') return `${formatPct(v)}%`;
  if (field === 'txnDate' && typeof v === 'string') return formatShortDate(v);
  if (field === 'repaidStatus' && (v === 'PENDING' || v === 'REPAID')) return REPAID_LABELS[v];
  return typeof v === 'string' ? `"${v}"` : JSON.stringify(v);
}

function sharesText(list: unknown): string {
  if (!Array.isArray(list) || !list.length) return 'none';
  return (list as ShareSummary[]).map(s => `${s.partnerName ?? '?'} ${formatPct(Number(s.sharePct ?? 0))}%`).join(', ');
}

export function actionLabel(entry: HistoryEntry): string {
  return ACTION_LABELS[entry.action] ?? entry.action;
}

/** One line per change, e.g. 'Amount: ₹5,00,000.00 → ₹6,00,000.00'. */
export function describeChanges(entry: HistoryEntry): string[] {
  const changes = entry.changes;
  if (entry.action === 'create') {
    const created = (changes.new ?? {}) as Record<string, unknown>;
    const lines = ['customerName', 'amount', 'commissionRatePct', 'commission', 'txnDate', 'repaidStatus']
      .filter(f => f in created)
      .map(f => `${FIELD_LABELS[f]}: ${show(f, created[f])}`);
    if ('shares' in created) lines.push(`Shares: ${sharesText(created.shares)}`);
    return lines;
  }
  if (entry.action === 'delete' || entry.action === 'restore') return [];

  const lines: string[] = [];
  for (const [field, value] of Object.entries(changes)) {
    const change = value as { old?: unknown; new?: unknown };
    if (field === 'shares') lines.push(`Shares: ${sharesText(change.old)} → ${sharesText(change.new)}`);
    else if (FIELD_LABELS[field]) lines.push(`${FIELD_LABELS[field]}: ${show(field, change.old)} → ${show(field, change.new)}`);
  }
  return lines;
}
