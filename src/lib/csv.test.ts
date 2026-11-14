import { describe, expect, it } from 'vitest';
import type { Transaction } from '../api/types.ts';
import { csvCell, partnerColumnsOf, transactionsToCsv } from './csv.ts';

const txn = (over: Partial<Transaction>): Transaction => ({
  id: 't1', createdAt: '2026-11-14T05:00:00.000Z', createdBy: 'w@gmail.com', updatedAt: '2026-11-14T05:00:00.000Z',
  updatedBy: 'w@gmail.com', deleted: false, deletedAt: '', deletedBy: '',
  txnDate: '2026-11-14', customerName: 'Ramesh Kumar', amount: 500000, commissionRatePct: 0.3, commission: 1500,
  repaidStatus: 'PENDING', notes: null,
  shares: [
    { partnerId: 'a', partnerName: 'Partner A', sharePct: 40, earning: 600 },
    { partnerId: 'b', partnerName: 'Partner B', sharePct: 60, earning: 900 }
  ],
  ...over
});

describe('csv', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('Kumar, R.')).toBe('"Kumar, R."');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(1500.5)).toBe('1500.5');
  });

  it('stops Excel from running typed text as a formula', () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvCell('+91 98765')).toBe("'+91 98765");
    expect(csvCell('@sum')).toBe("'@sum");
  });

  it('writes one row per transaction with a column per partner', () => {
    const t2 = txn({ id: 't2', customerName: 'Suresh', amount: 1000, commission: 3, repaidStatus: 'REPAID', notes: 'paid, early',
      shares: [{ partnerId: 'c', partnerName: 'Partner C', sharePct: 100, earning: 3 }] });
    const txns = [txn({}), t2];
    const columns = partnerColumnsOf(txns);
    expect(columns.map(c => c.name)).toEqual(['Partner A', 'Partner B', 'Partner C']);

    const csv = transactionsToCsv(txns, columns);
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).trimEnd().split('\r\n');
    expect(lines[0]).toBe('Date,Customer,Amount (₹),Rate (%),Commission (₹),Status,Notes,Partner A (₹),Partner B (₹),Partner C (₹),Created by,Created at,Last changed by,Last changed at');
    expect(lines[1]).toBe('2026-11-14,Ramesh Kumar,500000,0.3,1500,Pending,,600,900,,w@gmail.com,2026-11-14T05:00:00.000Z,w@gmail.com,2026-11-14T05:00:00.000Z');
    expect(lines[2]?.startsWith('2026-11-14,Suresh,1000,0.3,3,Repaid,"paid, early",,,3,')).toBe(true);
    expect(lines).toHaveLength(3);
  });
});
