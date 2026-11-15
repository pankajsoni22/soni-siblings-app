import { describe, expect, it } from 'vitest';
import type { ApiClient } from '../api/ApiClient.ts';
import type { AppConfig, SyncResult, Transaction } from '../api/types.ts';
import { DataStore } from './store.ts';

const config = { today: '2026-11-15' } as AppConfig;
const user = { email: 'a@gmail.com', name: 'A', role: 'ADMIN' as const, isOwner: true };
const t = (id: string, updatedAt: string, amount = 1) => ({ id, updatedAt, amount }) as Transaction;
const reply = (over: Partial<SyncResult>): SyncResult =>
  ({ user, config, partners: [], full: false, cursor: 'c', transactions: [], removed: [], ...over });

/** An ApiClient whose sync answers are queued by the test and records the `since` it was given. */
function fakeApi() {
  const calls: (string | undefined)[] = [];
  const answers: ((r: SyncResult) => void)[] = [];
  const api = { sync: (since?: string) => { calls.push(since); return new Promise<SyncResult>(res => answers.push(res)); } } as unknown as ApiClient;
  return { api, calls, answer: (r: SyncResult) => answers.shift()?.(r) };
}
const ids = (s: DataStore) => s.getSnapshot().txns.map(x => x.id).sort();

describe('DataStore', () => {
  it('loads everything first, then asks only for changes since the cursor', async () => {
    const s = new DataStore();
    s.open('a@gmail.com');
    const f = fakeApi();
    const first = s.sync(f.api);
    f.answer(reply({ full: true, cursor: 'c1', transactions: [t('1', 'u1'), t('2', 'u1')] }));
    await first;
    expect(ids(s)).toEqual(['1', '2']);
    expect(s.getSnapshot().config).toBe(config);

    const next = s.sync(f.api);
    f.answer(reply({ cursor: 'c2', transactions: [t('3', 'u2'), t('1', 'u2', 99)], removed: ['2'] }));
    await next;
    expect(f.calls).toEqual([undefined, 'c1']);
    expect(ids(s)).toEqual(['1', '3']);
    expect(s.getSnapshot().byId.get('1')?.amount).toBe(99);
  });

  it('shares one request between concurrent syncs; Refresh forces a full one', async () => {
    const s = new DataStore();
    s.open('a@gmail.com');
    const f = fakeApi();
    const a = s.sync(f.api), b = s.sync(f.api);
    expect(a).toBe(b);
    f.answer(reply({ full: true, cursor: 'c1' }));
    await a;
    const full = s.sync(f.api, { full: true });
    f.answer(reply({ full: true, cursor: 'c2' }));
    await full;
    expect(f.calls).toEqual([undefined, undefined]);
  });

  it('keeps own saves made while a sync was in flight', async () => {
    const s = new DataStore();
    s.open('a@gmail.com');
    const f = fakeApi();
    const first = s.sync(f.api);
    f.answer(reply({ full: true, cursor: 'c1', transactions: [t('1', 'u1'), t('2', 'u1')] }));
    await first;

    const running = s.sync(f.api);
    s.upsert(t('1', 'u3', 50));     // saved after the server read its rows
    s.remove('2');
    s.upsert(t('9', 'u3'));
    f.answer(reply({ cursor: 'c2', transactions: [t('1', 'u2', 7), t('2', 'u2')] }));
    await running;
    expect(ids(s)).toEqual(['1', '9']);
    expect(s.getSnapshot().byId.get('1')?.amount).toBe(50);
  });

  it('never replaces a newer copy with an older one', () => {
    const s = new DataStore();
    s.open('a@gmail.com');
    s.upsert(t('1', 'u5', 5));
    s.upsert(t('1', 'u4', 4));
    expect(s.getSnapshot().byId.get('1')?.amount).toBe(5);
  });

  it('wipes the copy for a different person, and ignores answers meant for the previous one', async () => {
    const s = new DataStore();
    s.open('a@gmail.com');
    const f = fakeApi();
    const first = s.sync(f.api);
    s.open('b@gmail.com');
    f.answer(reply({ full: true, cursor: 'c1', transactions: [t('1', 'u1')] }));
    await first;
    expect(ids(s)).toEqual([]);
    expect(s.getSnapshot().config).toBeNull();
  });

  it('records a failed sync and clears the error on the next success', async () => {
    const s = new DataStore();
    s.open('a@gmail.com');
    const api = { sync: () => Promise.reject(new Error('offline')) } as unknown as ApiClient;
    await expect(s.sync(api)).rejects.toThrow('offline');
    expect(s.getSnapshot().error?.message).toBe('offline');
    expect(s.getSnapshot().syncing).toBe(false);
    const f = fakeApi();
    const ok = s.sync(f.api);
    f.answer(reply({ full: true }));
    await ok;
    expect(s.getSnapshot().error).toBeNull();
  });
});
