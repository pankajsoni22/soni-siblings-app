/**
 * Money rules for the live figures on screen. These mirror apps-script/Money.gs exactly; both are
 * tested against shared/calc-cases.json. The server recalculates on save, so the screen is a
 * preview, but they must agree or users would see one number and save another.
 *
 *   commission = amount × rate ÷ 100, rounded half up to the paisa
 *   earning    = commission × share ÷ 100, rounded down to the paisa; the last partner with a
 *                non-zero share (in partner order) takes what is left
 */

export const RATE_SCALE = 10_000;   // rate units per percent: 0.30% → 3000
export const SHARE_SCALE = 100;     // share units per percent: 33.33% → 3333; all shares total 10000

export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function fromPaise(paise: number): number {
  return paise / 100;
}

/** True when n has no more than `places` decimals (tolerates binary floating-point noise). */
export function hasMaxDecimals(n: number, places: number): boolean {
  const f = 10 ** places;
  return Math.abs(Math.round(n * f) - n * f) < 1e-6;
}

/** Commission in paise; every intermediate product stays exact (below 2^53). */
export function commissionPaise(amountPaise: number, ratePct: number): number {
  const rate = Math.round(ratePct * RATE_SCALE);
  const unit = 100 * RATE_SCALE;
  const whole = Math.floor(amountPaise / unit);
  const rest = amountPaise % unit;
  return whole * rate + Math.floor((rest * rate + unit / 2) / unit);
}

/** Earnings in paise for each share, in the order given (which must be partner order). */
export function splitPaise(commission: number, sharesPct: readonly number[]): number[] {
  const units = sharesPct.map(p => Math.round(p * SHARE_SCALE));
  const out = units.map(u => Math.floor(commission * u / (100 * SHARE_SCALE)));
  const last = units.findLastIndex(u => u > 0);
  if (last >= 0) out[last] = (out[last] ?? 0) + commission - out.reduce((a, b) => a + b, 0);
  return out;
}

/** Sum of share percentages, exact to 2 decimals (33.33 + 33.33 + 33.34 → 100). */
export function sharesTotalPct(sharesPct: readonly number[]): number {
  return sharesPct.reduce((t, p) => t + Math.round(p * SHARE_SCALE), 0) / SHARE_SCALE;
}

/** Default split that adds up to exactly 100%: 33.33, 33.33, 33.34 for three partners. */
export function equalSharesPct(count: number): number[] {
  if (count <= 0) return [];
  const total = 100 * SHARE_SCALE;
  const each = Math.floor(total / count);
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? total - each * (count - 1) : each) / SHARE_SCALE);
}

/** The preview the transaction form shows: commission and each earning, in rupees. */
export function previewSplit(amount: number, ratePct: number, sharesPct: readonly number[]): { commission: number; earnings: number[] } {
  const commission = commissionPaise(toPaise(amount), ratePct);
  return { commission: fromPaise(commission), earnings: splitPaise(commission, sharesPct).map(fromPaise) };
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹1,25,000.00 */
export function formatINR(rupees: number): string {
  return inr.format(rupees);
}

/**
 * Reads what a user typed in an amount or percentage box: allows ₹, commas and spaces
 * ("5,00,000"). Returns null for anything that is not a plain non-negative number.
 */
export function parseNumber(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
