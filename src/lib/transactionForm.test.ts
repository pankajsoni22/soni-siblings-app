import { describe, expect, it } from 'vitest';
import type { AppConfig, Transaction } from '../api/types.ts';
import {
  fieldOfServerMessage, formatAmountInput, formatPct, initialForm, previewOf, resetShares, sharesStatus,
  splitEqually, validateForm, type FormState
} from './transactionForm.ts';

const config: AppConfig = {
  defaultCommissionRatePct: 0.3,
  rateWarningAbovePct: 2,
  partners: [
    { id: 'a', name: 'Partner A', defaultSharePct: 40, sortOrder: 0 },
    { id: 'b', name: 'Partner B', defaultSharePct: 30, sortOrder: 2 },
    { id: 'd', name: 'Partner D', defaultSharePct: 30, sortOrder: 3 }
  ],
  partnerOrder: ['a', 'c', 'b', 'd'],      // c is inactive
  today: '2026-11-14'
};

const filled = (over: Partial<FormState> = {}): FormState => ({
  ...initialForm(config), customerName: 'Ramesh Kumar', amount: '5,00,000', ...over
});

describe('initial form', () => {
  it('starts from today, the default rate and default shares', () => {
    const f = initialForm(config);
    expect(f).toMatchObject({ txnDate: '2026-11-14', rate: '0.30', repaidStatus: 'PENDING', amount: '' });
    expect(f.shares.map(s => [s.partnerId, s.pct])).toEqual([['a', '40'], ['b', '30'], ['d', '30']]);
    expect(initialForm(config, null, '2026-11-10').txnDate).toBe('2026-11-10');
  });

  it('an edit keeps the saved shares, inactive partners included, in partner order', () => {
    const txn = {
      txnDate: '2026-05-10', customerName: 'Suresh', amount: 1234.5, commissionRatePct: 0.275, repaidStatus: 'REPAID',
      notes: null, shares: [
        { partnerId: 'a', partnerName: 'Partner A', sharePct: 33.33, earning: 0 },
        { partnerId: 'b', partnerName: 'Partner B', sharePct: 33.33, earning: 0 },
        { partnerId: 'c', partnerName: 'Partner C', sharePct: 33.34, earning: 0 }
      ]
    } as unknown as Transaction;
    const f = initialForm(config, txn);
    expect(f).toMatchObject({ amount: '1,234.50', rate: '0.275', repaidStatus: 'REPAID', notes: '' });
    expect(f.shares.map(s => [s.partnerId, s.pct, s.active])).toEqual([
      ['a', '33.33', true], ['c', '33.34', false], ['b', '33.33', true], ['d', '0', true]
    ]);
  });

  it('formats numbers for editing', () => {
    expect(formatPct(0.3)).toBe('0.30');
    expect(formatPct(40)).toBe('40');
    expect(formatPct(33.34)).toBe('33.34');
    expect(formatAmountInput(500000)).toBe('5,00,000');
  });
});

describe('shares', () => {
  it('reports the gap until the total is 100%', () => {
    expect(sharesStatus(filled())).toEqual({ totalPct: 100, ok: true, message: null });
    const f = filled();
    f.shares = f.shares.map(s => (s.partnerId === 'd' ? { ...s, pct: '25' } : s));
    expect(sharesStatus(f)).toMatchObject({ ok: false, message: '5% left to assign' });
    f.shares = f.shares.map(s => (s.partnerId === 'd' ? { ...s, pct: '35.5' } : s));
    expect(sharesStatus(f)).toMatchObject({ ok: false, message: '5.5% too much' });
  });

  it('reset uses defaults; equal split covers active partners only', () => {
    const txnForm: FormState = { ...filled(), shares: [
      { partnerId: 'a', partnerName: 'A', active: true, defaultSharePct: 40, pct: '10' },
      { partnerId: 'c', partnerName: 'C', active: false, defaultSharePct: 0, pct: '90' },
      { partnerId: 'b', partnerName: 'B', active: true, defaultSharePct: 60, pct: '0' }
    ] };
    expect(resetShares(txnForm).map(s => s.pct)).toEqual(['40', '0', '60']);
    expect(splitEqually(txnForm).map(s => s.pct)).toEqual(['50', '0', '50']);
    expect(splitEqually(filled()).map(s => s.pct)).toEqual(['33.33', '33.33', '33.34']);
  });
});

describe('preview', () => {
  it('shows commission and earnings as soon as amount and rate are readable', () => {
    expect(previewOf(filled())).toEqual({ commission: 1500, earnings: [600, 450, 450] });
    expect(previewOf(filled({ amount: '' }))).toBeNull();
    expect(previewOf(filled({ rate: 'abc' }))).toBeNull();
  });

  it('gives the leftover paisa to the last partner in partner order', () => {
    const f = filled({ amount: '1,00,000' });
    f.shares = splitEqually(f);
    expect(previewOf(f)).toEqual({ commission: 300, earnings: [99.99, 99.99, 100.02] });
  });
});

describe('validation', () => {
  it('builds the payload from a valid form', () => {
    const v = validateForm(filled({ notes: '  short loan ' }), config.today);
    expect(v).toEqual({
      ok: true,
      input: { txnDate: '2026-11-14', customerName: 'Ramesh Kumar', amount: 500000, commissionRatePct: 0.3, repaidStatus: 'PENDING', notes: 'short loan' },
      shares: [{ partnerId: 'a', sharePct: 40 }, { partnerId: 'b', sharePct: 30 }, { partnerId: 'd', sharePct: 30 }]
    });
  });

  it('explains each problem beside its field', () => {
    const errorsOf = (over: Partial<FormState>) => {
      const v = validateForm(filled(over), config.today);
      return v.ok ? {} : v.errors;
    };
    expect(errorsOf({ txnDate: '2026-11-15' }).txnDate).toMatch(/future/);
    expect(errorsOf({ customerName: '  ' }).customerName).toMatch(/customer/);
    expect(errorsOf({ amount: '' }).amount).toMatch(/Enter the amount/);
    expect(errorsOf({ amount: '12abc' }).amount).toMatch(/like/);
    expect(errorsOf({ amount: '0' }).amount).toMatch(/more than/);
    expect(errorsOf({ amount: '100.005' }).amount).toMatch(/2 decimal/);
    expect(errorsOf({ amount: '2,00,00,00,000' }).amount).toMatch(/100 crore/);
    expect(errorsOf({ rate: '0' }).rate).toMatch(/more than 0%/);
    expect(errorsOf({ rate: '0.12345' }).rate).toMatch(/4 decimal/);
    expect(errorsOf({ notes: 'x'.repeat(501) }).notes).toMatch(/500/);
    const f = filled();
    f.shares = f.shares.map(s => ({ ...s, pct: '30' }));
    expect(validateForm(f, config.today)).toMatchObject({ ok: false, errors: { shares: 'Shares add up to 90%; they must total 100%' } });
  });

  it('maps server messages to fields', () => {
    expect(fieldOfServerMessage('amount must have at most 2 decimal places')).toBe('amount');
    expect(fieldOfServerMessage('commissionRatePct must be more than 0 and less than 100')).toBe('rate');
    expect(fieldOfServerMessage('Shares add up to 99%; they must total 100%')).toBe('shares');
    expect(fieldOfServerMessage('Partner "C" is inactive')).toBe('shares');
    expect(fieldOfServerMessage('Something else')).toBeNull();
  });
});
