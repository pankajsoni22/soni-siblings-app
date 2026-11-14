/**
 * Money rules. Amounts are calculated in whole paise (integers) so totals never drift.
 *
 *   commission = amount × rate ÷ 100, rounded half up to the paisa
 *   earning    = commission × share ÷ 100, rounded down to the paisa; the last partner with a
 *                non-zero share (in partner order) takes what is left, so earnings always add
 *                up exactly to the commission
 *
 * Rates are percentages with up to 4 decimals (0.30, 0.275); shares are percentages with up
 * to 2 decimals (33.33) and must total exactly 100.
 *
 * src/lib/money.ts implements the same rules for the live figures on screen. Both are tested
 * against shared/calc-cases.json, so they cannot drift apart unnoticed.
 */

const RATE_SCALE = 10000;   // rate units per percent: 0.30% → 3000
const SHARE_SCALE = 100;    // share units per percent: 33.33% → 3333; all shares total 10000

function toPaise_(rupees) {
  return Math.round(Number(rupees) * 100);
}

function fromPaise_(paise) {
  return paise / 100;
}

/** True when n has no more than `places` decimals (tolerates binary floating-point noise). */
function hasMaxDecimals_(n, places) {
  const f = Math.pow(10, places);
  return Math.abs(Math.round(n * f) - n * f) < 1e-6;
}

/**
 * Commission in paise. Split into whole millions of paise and the rest, so every
 * intermediate product stays below 2^53 and is exact, even for ₹100 crore at 99.9999%.
 */
function commissionPaise_(amountPaise, ratePct) {
  const rate = Math.round(ratePct * RATE_SCALE);
  const unit = 100 * RATE_SCALE;                     // 1,000,000
  const whole = Math.floor(amountPaise / unit);
  const rest = amountPaise % unit;
  return whole * rate + Math.floor((rest * rate + unit / 2) / unit);
}

/** Earnings in paise for each share, in the order given (which must be partner order). */
function splitPaise_(commission, sharesPct) {
  const units = sharesPct.map(p => Math.round(p * SHARE_SCALE));
  const out = units.map(u => Math.floor(commission * u / (100 * SHARE_SCALE)));
  let last = -1;
  units.forEach((u, i) => { if (u > 0) last = i; });
  if (last >= 0) out[last] += commission - out.reduce((a, b) => a + b, 0);
  return out;
}
