import { describe, expect, it } from 'vitest';
import type { HistoryEntry, Partner } from '../api/types.ts';
import { actionLabel, describeChanges } from './history.ts';
import { activeTotalPct, moveRow, newRow, rowsFrom, validatePartners, type PartnerRow } from './partnersForm.ts';

const partner = (id: string, name: string, pct: number, active = true): Partner => ({
  id, name, defaultSharePct: pct, active, sortOrder: 0,
  createdAt: '', createdBy: '', updatedAt: '', updatedBy: '', deleted: false, deletedAt: '', deletedBy: ''
});

describe('partners form', () => {
  const rows = rowsFrom([partner('a', 'Pankaj', 40), partner('b', 'Ravi', 30), partner('c', 'Sunita', 30), partner('d', 'Old', 10, false)]);

  it('totals only active partners', () => {
    expect(activeTotalPct(rows)).toBe(100);
    expect(activeTotalPct(rows.map(r => (r.key === 'd' ? { ...r, active: true } : r)))).toBe(110);
    expect(activeTotalPct(rows.map(r => (r.key === 'a' ? { ...r, pct: 'x' } : r)))).toBeNaN();
  });

  it('saves the list in order, ids kept, names trimmed', () => {
    const added: PartnerRow = { ...newRow(), name: '  Meena ', pct: '0', active: false };
    const v = validatePartners([...rows, added]);
    expect(v.ok && v.input).toEqual([
      { id: 'a', name: 'Pankaj', defaultSharePct: 40, active: true },
      { id: 'b', name: 'Ravi', defaultSharePct: 30, active: true },
      { id: 'c', name: 'Sunita', defaultSharePct: 30, active: true },
      { id: 'd', name: 'Old', defaultSharePct: 10, active: false },
      { name: 'Meena', defaultSharePct: 0, active: false }
    ]);
  });

  it('explains what blocks saving', () => {
    const errs = (list: PartnerRow[]) => { const v = validatePartners(list); return v.ok ? {} : v.errors; };
    expect(errs(rows.map(r => (r.key === 'c' ? { ...r, pct: '25' } : r)))._form).toMatch(/95%/);
    expect(errs(rows.map(r => (r.key === 'b' ? { ...r, name: ' pankaj ' } : r))).b).toMatch(/already named/);
    expect(errs(rows.map(r => (r.key === 'a' ? { ...r, name: '' } : r))).a).toMatch(/name/);
    expect(errs(rows.map(r => (r.key === 'a' ? { ...r, pct: '33.333' } : r))).a).toMatch(/2 decimal/);
    expect(errs(rows.map(r => ({ ...r, active: false })))._form).toMatch(/active/);
    expect(errs([])._form).toMatch(/at least one/);
  });

  it('moves rows up and down, ignoring moves past the ends', () => {
    expect(moveRow(rows, 'b', -1).map(r => r.key)).toEqual(['b', 'a', 'c', 'd']);
    expect(moveRow(rows, 'd', 1).map(r => r.key)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('history', () => {
  const entry = (action: HistoryEntry['action'], changes: Record<string, unknown>): HistoryEntry =>
    ({ timestamp: '2026-11-14T05:00:00.000Z', email: 'w@gmail.com', action, changes });

  it('describes a creation', () => {
    const e = entry('create', { new: { customerName: 'Ramesh', amount: 500000, commissionRatePct: 0.3, commission: 1500, txnDate: '2026-11-14', repaidStatus: 'PENDING',
      shares: [{ partnerName: 'A', sharePct: 40 }, { partnerName: 'B', sharePct: 60 }] } });
    expect(actionLabel(e)).toBe('Created');
    expect(describeChanges(e)).toEqual([
      'Customer: "Ramesh"', 'Amount: ₹5,00,000.00', 'Rate: 0.30%', 'Commission: ₹1,500.00', 'Date: 14 Nov 2026', 'Status: Pending',
      'Shares: A 40%, B 60%'
    ]);
  });

  it('describes changes old → new', () => {
    const e = entry('update', {
      amount: { old: 500000, new: 600000 },
      repaidStatus: { old: 'PENDING', new: 'REPAID' },
      notes: { old: null, new: 'paid' },
      shares: { old: [{ partnerName: 'A', sharePct: 40 }], new: [{ partnerName: 'A', sharePct: 50 }] },
      updatedAt: { old: 'x', new: 'y' }
    });
    expect(describeChanges(e)).toEqual([
      'Amount: ₹5,00,000.00 → ₹6,00,000.00', 'Status: Pending → Repaid', 'Notes: (empty) → "paid"', 'Shares: A 40% → A 50%'
    ]);
  });

  it('delete and restore need no detail', () => {
    expect(describeChanges(entry('delete', { deleted: { old: false, new: true } }))).toEqual([]);
    expect(actionLabel(entry('restore', {}))).toBe('Restored');
  });
});
