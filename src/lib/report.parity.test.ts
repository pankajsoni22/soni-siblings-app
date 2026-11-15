// Runs in Node (type-checked by tsconfig.node.json): loads the real backend through its test harness.
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import type { SyncResult } from '../api/types.ts';
import { computeReport } from './report.ts';

// The real backend, run in Node against mock Google services (apps-script/test/harness.cjs).
const require = createRequire(import.meta.url);
interface Env {
  run: (code: string) => unknown;
  call: (token: string, action: string, payload?: object) => { ok: boolean; data: unknown; error?: unknown };
}
const { makeEnv, tok, OWNER } = require('../../apps-script/test/harness.cjs') as {
  makeEnv: (o?: object) => Env; tok: (email: string) => string; OWNER: string;
};

function ok<T>(res: { ok: boolean; data: unknown; error?: unknown }): T {
  if (!res.ok) throw new Error(JSON.stringify(res.error));
  return res.data as T;
}

describe('computeReport matches the server report', () => {
  const env = makeEnv({ maxRows: 50 });
  env.run('setup()');
  const call = <T>(action: string, payload?: object) => ok<T>(env.call(tok(OWNER), action, payload));
  const [A, B, C] = call<{ id: string }[]>('savePartners', { partners: [
    { name: 'A', defaultSharePct: 33.34 }, { name: 'B', defaultSharePct: 33.33 }, { name: 'C', defaultSharePct: 33.33 }
  ] });
  if (!A || !B || !C) throw new Error('partners not saved');
  const shares = [{ partnerId: A.id, sharePct: 33.34 }, { partnerId: B.id, sharePct: 33.33 }, { partnerId: C.id, sharePct: 33.33 }];
  const rows: [string, number, number, 'PENDING' | 'REPAID'][] = [
    ['2025-03-31', 100000.55, 0.3, 'REPAID'], ['2025-04-01', 333333.33, 0.275, 'PENDING'], ['2025-12-15', 7, 0.3333, 'REPAID'],
    ['2026-02-28', 2500000, 0.25, 'PENDING'], ['2026-04-10', 125000.5, 0.3, 'REPAID'], ['2026-11-01', 99999.99, 1.5, 'PENDING']
  ];
  const saved = rows.map(([txnDate, amount, commissionRatePct, repaidStatus]) => call<{ id: string }>('saveTransaction', {
    transaction: { txnDate, customerName: `C ${txnDate}`, amount, commissionRatePct, repaidStatus, notes: '' }, shares
  }));
  call('deleteTransaction', { id: saved[2]?.id });
  // Partner C leaves: inactive partners still show where they earned.
  call('savePartners', { partners: [
    { id: A.id, name: 'A', defaultSharePct: 50 }, { id: B.id, name: 'B renamed', defaultSharePct: 50 }, { id: C.id, name: 'C', defaultSharePct: 0, active: false }
  ] });
  const synced = call<SyncResult>('sync', {});

  it.each([
    ['2025-04-01', '2026-03-31'], ['2025-01-01', '2026-12-31'], ['2026-04-01', '2026-04-30'], ['2027-01-01', '2027-01-31'], ['2010-01-01', '2026-11-30']
  ])('from %s to %s', (from, to) => {
    expect(computeReport(synced.transactions, from, to, synced.partners)).toEqual(call('report', { from, to }));
  });
});
