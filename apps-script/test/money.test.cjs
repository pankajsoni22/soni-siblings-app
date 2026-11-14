// The backend's money rules against the cases shared with the frontend (shared/calc-cases.json).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv } = require('./harness.cjs');
const { cases } = require('../../shared/calc-cases.json');

const env = makeEnv();

for (const c of cases) {
  test(c.name, () => {
    const commission = env.run(`commissionPaise_(toPaise_(${c.amount}), ${c.ratePct})`);
    assert.equal(commission, c.commissionPaise, 'commission');
    // JSON round trip: arrays made inside the sandbox fail strict equality against local ones
    const earnings = JSON.parse(env.run(`JSON.stringify(splitPaise_(${commission}, ${JSON.stringify(c.sharesPct)}))`));
    assert.deepEqual(earnings, c.earningsPaise, 'earnings');
    assert.equal(earnings.reduce((a, b) => a + b, 0), commission, 'earnings add up to the commission');
  });
}

test('decimal place checks tolerate floating-point noise', () => {
  assert.equal(env.run('hasMaxDecimals_(12345.67, 2)'), true);
  assert.equal(env.run('hasMaxDecimals_(0.1 + 0.2, 2)'), true);
  assert.equal(env.run('hasMaxDecimals_(1.005, 2)'), false);
  assert.equal(env.run('hasMaxDecimals_(0.2755, 4)'), true);
  assert.equal(env.run('hasMaxDecimals_(0.27555, 4)'), false);
});
