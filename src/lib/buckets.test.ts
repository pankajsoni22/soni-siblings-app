import { describe, expect, it } from 'vitest';
import type { Transaction } from '../api/types.ts';
import { bucketize, chartRange, defaultGrain, grainsFor } from './buckets.ts';
import { BEGINNING } from './fy.ts';

const txn = (txnDate: string, amount: number, commission: number, shares: [string, number][] = []) =>
  ({ txnDate, amount, commission, shares: shares.map(([partnerId, earning]) => ({ partnerId, earning })) }) as Transaction;

describe('grains', () => {
  it('offers daily and weekly for a month, and adds monthly beyond a month', () => {
    expect(grainsFor('2026-11-01', '2026-11-30')).toEqual(['day', 'week']);
    expect(grainsFor('2026-11-01', '2026-11-07')).toEqual(['day']);
    expect(grainsFor('2026-10-01', '2026-12-31')).toEqual(['day', 'week', 'month']);
    expect(grainsFor('2026-04-01', '2027-03-31')).toEqual(['day', 'week', 'month']);
    expect(grainsFor('2020-01-01', '2026-11-15')).toEqual(['week', 'month']);
    expect(grainsFor('2000-01-01', '2026-11-15')).toEqual(['month']);
  });

  it('defaults to daily up to a quarter, monthly after', () => {
    expect(defaultGrain('2026-11-01', '2026-11-30')).toBe('day');
    expect(defaultGrain('2026-10-01', '2026-12-31')).toBe('day');
    expect(defaultGrain('2026-04-01', '2027-03-31')).toBe('month');
    expect(defaultGrain('2026-11-15', '2026-11-15')).toBe('day');
  });

  it('starts "from the beginning" at the first entry', () => {
    const txns = [txn('2024-06-03', 1, 0), txn('2023-02-10', 1, 0)];
    expect(chartRange(BEGINNING, '2026-11-15', txns)).toEqual({ from: '2023-02-10', to: '2026-11-15' });
    expect(chartRange(BEGINNING, '2026-11-15', [])).toEqual({ from: BEGINNING, to: '2026-11-15' });
    expect(chartRange('2026-11-01', '2026-11-30', txns)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
  });
});

describe('bucketize', () => {
  const txns = [txn('2026-11-02', 100000.5, 300.25), txn('2026-11-02', 0.1, 0.2), txn('2026-11-10', 5000, 15), txn('2026-12-01', 9, 9)];

  it('sums each day, keeps empty days, and adds up exactly', () => {
    const days = bucketize(txns, '2026-11-01', '2026-11-30', 'day');
    expect(days).toHaveLength(30);
    expect(days[0]).toMatchObject({ from: '2026-11-01', count: 0, lent: 0 });
    expect(days[1]).toMatchObject({ short: '2 Nov', label: '2 Nov 2026', lent: 100000.6, commission: 300.45, count: 2 });
  });

  it('cuts Monday–Sunday weeks at the range edges', () => {
    const weeks = bucketize(txns, '2026-11-01', '2026-11-30', 'week');
    expect(weeks.map(w => [w.from, w.to])).toEqual([
      ['2026-11-01', '2026-11-01'], ['2026-11-02', '2026-11-08'], ['2026-11-09', '2026-11-15'],
      ['2026-11-16', '2026-11-22'], ['2026-11-23', '2026-11-29'], ['2026-11-30', '2026-11-30']
    ]);
    expect(weeks[1]).toMatchObject({ label: '2–8 Nov 2026', count: 2 });
    expect(weeks[2]).toMatchObject({ count: 1, lent: 5000 });
  });

  it('sums each partner\'s earnings per bucket, exactly', () => {
    const list = [
      txn('2026-11-02', 1000, 3.01, [['p1', 1.01], ['p2', 1], ['p3', 1]]),
      txn('2026-11-02', 1000, 0.2, [['p1', 0.1], ['p2', 0.1]]),
      txn('2026-11-03', 1000, 7, [['p3', 7]])
    ];
    const days = bucketize(list, '2026-11-01', '2026-11-03', 'day');
    expect(days.map(d => d.earnings)).toEqual([{}, { p1: 1.11, p2: 1.1, p3: 1 }, { p3: 7 }]);
    const weeks = bucketize(list, '2026-11-01', '2026-11-08', 'week');
    expect(weeks[1]?.earnings).toEqual({ p1: 1.11, p2: 1.1, p3: 8 });
  });

  it('labels weeks across months and groups months', () => {
    const weeks = bucketize([], '2026-10-26', '2026-11-08', 'week');
    expect(weeks[0]?.label).toBe('26 Oct – 1 Nov 2026');
    const months = bucketize(txns, '2026-10-15', '2026-12-31', 'month');
    expect(months.map(m => [m.from, m.to, m.short, m.count])).toEqual([
      ['2026-10-15', '2026-10-31', "Oct '26", 0], ['2026-11-01', '2026-11-30', "Nov '26", 3], ['2026-12-01', '2026-12-31', "Dec '26", 1]
    ]);
  });
});
