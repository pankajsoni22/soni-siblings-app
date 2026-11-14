import { describe, expect, it } from 'vitest';
import calc from '../../shared/calc-cases.json';
import {
  commissionPaise, equalSharesPct, formatINR, formatINRCompact, hasMaxDecimals, niceCeil, parseNumber, previewSplit,
  sharesTotalPct, splitPaise, toPaise
} from './money.ts';

describe('shared calculation cases (same file as the backend tests)', () => {
  for (const c of calc.cases) {
    it(c.name, () => {
      const commission = commissionPaise(toPaise(c.amount), c.ratePct);
      expect(commission).toBe(c.commissionPaise);
      const earnings = splitPaise(commission, c.sharesPct);
      expect(earnings).toEqual(c.earningsPaise);
      expect(earnings.reduce((a, b) => a + b, 0)).toBe(commission);
    });
  }
});

describe('helpers', () => {
  it('previews in rupees', () => {
    expect(previewSplit(500000, 0.3, [40, 30, 30])).toEqual({ commission: 1500, earnings: [600, 450, 450] });
  });

  it('equal shares always total exactly 100%', () => {
    expect(equalSharesPct(3)).toEqual([33.33, 33.33, 33.34]);
    expect(equalSharesPct(1)).toEqual([100]);
    expect(equalSharesPct(0)).toEqual([]);
    for (let n = 1; n <= 12; n++) expect(sharesTotalPct(equalSharesPct(n))).toBe(100);
  });

  it('totals shares exactly despite floating point', () => {
    expect(sharesTotalPct([33.33, 33.33, 33.34])).toBe(100);
    expect(sharesTotalPct([0.1, 0.2, 99.7])).toBe(100);
    expect(sharesTotalPct([40, 30, 29.99])).toBe(99.99);
  });

  it('checks decimal places', () => {
    expect(hasMaxDecimals(12345.67, 2)).toBe(true);
    expect(hasMaxDecimals(1.005, 2)).toBe(false);
    expect(hasMaxDecimals(0.275, 4)).toBe(true);
  });

  it('formats rupees with Indian grouping', () => {
    expect(formatINR(125000)).toBe('₹1,25,000.00');
    expect(formatINR(1500)).toBe('₹1,500.00');
    expect(formatINR(0.5)).toBe('₹0.50');
  });

  it('formats compact amounts in lakh and crore for chart axes', () => {
    expect(formatINRCompact(150000)).toBe('₹1.5L');
    expect(formatINRCompact(25000000)).toBe('₹2.5Cr');
    expect(formatINRCompact(1500)).toBe('₹1.5K');
  });

  it('rounds axis maxima to clean numbers', () => {
    expect([0, 7, 13, 21, 240, 1800, 2350].map(niceCeil)).toEqual([0, 10, 20, 25, 250, 2000, 2500]);
  });

  it('reads typed numbers, tolerating ₹, commas and spaces', () => {
    expect(parseNumber('5,00,000')).toBe(500000);
    expect(parseNumber(' ₹ 1,234.50 ')).toBe(1234.5);
    expect(parseNumber('0.30')).toBe(0.3);
    expect(parseNumber('.5')).toBe(0.5);
    for (const bad of ['', 'abc', '-5', '1.2.3', '1e5', '12a']) expect(parseNumber(bad)).toBeNull();
  });
});
