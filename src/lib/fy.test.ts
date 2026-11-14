import { describe, expect, it } from 'vitest';
import {
  comparisonFor, formatMonth, formatShortDate, fyLabel, fyQuarter, fyStartYear, lastDayOfMonth, percentChange, periodFor, todayIst,
  trailingMonths
} from './fy.ts';

const range = (key: Parameters<typeof periodFor>[0], today: string) => {
  const p = periodFor(key, today);
  return [p.from, p.to, p.detail];
};

describe('financial year', () => {
  it('starts on 1 April', () => {
    expect(fyStartYear('2026-03-31')).toBe(2025);
    expect(fyStartYear('2026-04-01')).toBe(2026);
    expect(fyLabel(2026)).toBe('FY 2026-27');
    expect(fyLabel(2099)).toBe('FY 2099-00');
  });

  it('numbers quarters from April', () => {
    expect(['2026-04-01', '2026-06-30', '2026-07-01', '2026-12-31', '2027-01-01', '2027-03-31'].map(fyQuarter))
      .toEqual([1, 1, 2, 3, 4, 4]);
  });

  it('knows month lengths, leap years included', () => {
    expect(lastDayOfMonth(2028, 2)).toBe(29);
    expect(lastDayOfMonth(2026, 2)).toBe(28);
    expect(lastDayOfMonth(2026, 4)).toBe(30);
  });
});

describe('periods', () => {
  const today = '2026-11-14';

  it('today and months', () => {
    expect(range('today', today)).toEqual(['2026-11-14', '2026-11-14', '14 Nov 2026']);
    expect(range('thisMonth', today)).toEqual(['2026-11-01', '2026-11-30', 'Nov 2026']);
    expect(range('lastMonth', today)).toEqual(['2026-10-01', '2026-10-31', 'Oct 2026']);
    expect(range('lastMonth', '2027-01-10')).toEqual(['2026-12-01', '2026-12-31', 'Dec 2026']);
    expect(range('thisMonth', '2028-02-05')[1]).toBe('2028-02-29');
  });

  it('quarters, including across the year boundary', () => {
    expect(range('thisQuarter', today)).toEqual(['2026-10-01', '2026-12-31', 'Q3 FY 2026-27 (Oct–Dec 2026)']);
    expect(range('lastQuarter', today)).toEqual(['2026-07-01', '2026-09-30', 'Q2 FY 2026-27 (Jul–Sep 2026)']);
    expect(range('thisQuarter', '2027-02-01')).toEqual(['2027-01-01', '2027-03-31', 'Q4 FY 2026-27 (Jan–Mar 2027)']);
    expect(range('lastQuarter', '2026-05-15')).toEqual(['2026-01-01', '2026-03-31', 'Q4 FY 2025-26 (Jan–Mar 2026)']);
  });

  it('financial years', () => {
    expect(range('thisFY', today)).toEqual(['2026-04-01', '2027-03-31', 'FY 2026-27 (Apr 2026 – Mar 2027)']);
    expect(range('lastFY', today)).toEqual(['2025-04-01', '2026-03-31', 'FY 2025-26 (Apr 2025 – Mar 2026)']);
    expect(range('thisFY', '2027-03-31')[0]).toBe('2026-04-01');
  });

  it('custom ranges are returned as given, swapped if reversed', () => {
    expect(periodFor('custom', today, { from: '2026-01-05', to: '2026-02-10' })).toMatchObject({ from: '2026-01-05', to: '2026-02-10', detail: '5 Jan 2026 – 10 Feb 2026' });
    expect(periodFor('custom', today, { from: '2026-02-10', to: '2026-01-05' })).toMatchObject({ from: '2026-01-05', to: '2026-02-10' });
  });
});

describe('comparison periods', () => {
  const today = '2026-11-14';
  const cmp = (key: Parameters<typeof periodFor>[0]) => {
    const c = comparisonFor(periodFor(key, today), today);
    return [c.from, c.to, c.label];
  };

  it('compares periods in progress to the same point of the previous one', () => {
    expect(cmp('today')).toEqual(['2026-11-13', '2026-11-13', 'vs yesterday']);
    expect(cmp('thisMonth')).toEqual(['2026-10-01', '2026-10-14', 'vs same point last month']);
    expect(cmp('thisQuarter')).toEqual(['2026-07-01', '2026-08-14', 'vs same point last quarter']);
    expect(cmp('thisFY')).toEqual(['2025-04-01', '2025-11-14', 'vs same point FY 2025-26']);
    // a previous month shorter than the elapsed days is clipped to its end
    const c = comparisonFor(periodFor('thisMonth', '2026-03-31'), '2026-03-31');
    expect([c.from, c.to]).toEqual(['2026-02-01', '2026-02-28']);
  });

  it('compares finished periods to the whole previous one', () => {
    expect(cmp('lastMonth')).toEqual(['2026-09-01', '2026-09-30', 'vs Sep 2026']);
    expect(comparisonFor(periodFor('lastMonth', '2026-01-10'), '2026-01-10').label).toBe('vs Nov 2025');
    expect(comparisonFor(periodFor('lastMonth', '2026-02-10'), '2026-02-10').label).toBe('vs Dec 2025');
    expect(cmp('lastQuarter')).toEqual(['2026-04-01', '2026-06-30', 'vs Q1']);
    expect(comparisonFor(periodFor('lastQuarter', '2026-05-01'), '2026-05-01').from).toBe('2025-10-01');
    expect(cmp('lastFY')).toEqual(['2024-04-01', '2025-03-31', 'vs FY 2024-25']);
  });

  it('compares a custom range to the same number of days before it', () => {
    const c = comparisonFor(periodFor('custom', today, { from: '2026-10-01', to: '2026-10-10' }), today);
    expect([c.from, c.to, c.label]).toEqual(['2026-09-21', '2026-09-30', 'vs previous 10 days']);
  });

  it('gives trailing months for single-month periods', () => {
    expect(trailingMonths('2026-11-14', 12)).toEqual({ from: '2025-12-01', to: '2026-11-14' });
    expect(trailingMonths('2026-01-31', 3)).toEqual({ from: '2025-11-01', to: '2026-01-31' });
  });

  it('computes percentage change', () => {
    expect(percentChange(110, 100)).toBeCloseTo(10);
    expect(percentChange(50, 100)).toBeCloseTo(-50);
    expect(percentChange(10, 0)).toBeNull();
  });
});

describe('dates', () => {
  it('formats short dates and months', () => {
    expect(formatShortDate('2026-11-04')).toBe('4 Nov 2026');
    expect(formatMonth('2026-04')).toBe('Apr 2026');
  });

  it('uses India time for today', () => {
    // 20:00 UTC on 14 Nov is 01:30 on 15 Nov in India
    expect(todayIst(new Date('2026-11-14T20:00:00Z'))).toBe('2026-11-15');
    expect(todayIst(new Date('2026-11-14T18:00:00Z'))).toBe('2026-11-14');
  });
});
