/**
 * The app's local copy of the business data: live transactions, settings and partners.
 *
 * Screens read from here, so changing the period or switching pages needs no server call.
 * - Saved in localStorage, so every tab shares it and reopening the app is instant.
 * - Kept fresh by `sync` (apps-script/Sync.gs): only what changed since the last sync comes back.
 *   A full reload happens on first use, every FULL_SYNC_EVERY_MS (to pick up hand edits in the
 *   Sheet), and on Refresh.
 * - The person's own saves are applied straight from the save's reply (see useApi).
 * - Wiped on sign-out, and when a different person signs in on the same browser.
 */
import type { ApiClient } from '../api/ApiClient.ts';
import type { AppConfig, Me, Partner, SyncResult, Transaction } from '../api/types.ts';

export const DATA_KEY = 'soni-lending.data.v1';
const FULL_SYNC_EVERY_MS = 12 * 60 * 60_000;

export type PartnerRef = Pick<Partner, 'id' | 'name' | 'active'>;

interface Persisted {
  owner: string;
  cursor: string;
  fullAt: number;
  syncedAt: number;
  user: Me | null;
  config: AppConfig;
  partners: PartnerRef[];
  txns: Transaction[];
}

export interface DataSnapshot {
  /** Null until the first sync has finished (or a saved copy was loaded). */
  config: AppConfig | null;
  partners: PartnerRef[];
  /** Live transactions, in no particular order. */
  txns: Transaction[];
  byId: ReadonlyMap<string, Transaction>;
  /** The signed-in person as of the last sync (role changes show up here). */
  user: Me | null;
  /** Epoch ms of the last successful sync; 0 if never. */
  syncedAt: number;
  syncing: boolean;
  /** The last sync's error, cleared by the next success. */
  error: Error | null;
}

const EMPTY: DataSnapshot = { config: null, partners: [], txns: [], byId: new Map(), user: null, syncedAt: 0, syncing: false, error: null };

export class DataStore {
  #owner = '';
  #cursor = '';
  #fullAt = 0;
  #txns = new Map<string, Transaction>();
  #snapshot: DataSnapshot = EMPTY;
  #listeners = new Set<() => void>();
  #inFlight: Promise<SyncResult | null> | null = null;
  /** Saves made while a sync was in flight; re-applied over its result if newer. */
  #localDuringSync = new Map<string, Transaction | null>();

  constructor() {
    if (typeof window === 'undefined') return;   // unit tests
    window.addEventListener('storage', e => {
      // Another tab synced or saved. (A removed copy is ignored: sign-out reloads every tab anyway,
      // and a tab that ran out of storage removes it while its data is still valid.)
      if (e.key === DATA_KEY && e.newValue !== null) this.#loadFrom(e.newValue);
    });
  }

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  };

  getSnapshot = () => this.#snapshot;

  /** Use the saved copy if it belongs to this person; otherwise wipe it. */
  open(email: string) {
    const owner = email.toLowerCase();
    if (this.#owner === owner) return;
    this.#reset();
    this.#owner = owner;
    let raw: string | null = null;
    try { raw = localStorage.getItem(DATA_KEY); } catch { /* storage blocked */ }
    if (raw && !this.#loadFrom(raw)) this.#removeSaved();
  }

  /** Wipes the copy, here and in storage (sign-out). */
  clear() {
    this.#reset();
    this.#removeSaved();
  }

  /**
   * Removes the copy from storage but keeps showing it in this tab. Used when the session ends
   * while the app is open: the person can sign in again and carry on, but nothing is left on the
   * device if they don't.
   */
  forgetSaved() {
    this.#removeSaved();
  }

  /**
   * Fetches changes (or everything, when `full` or due). Concurrent calls share one request.
   * Resolves null if there is no signed-in owner yet; rejects on failure (also kept in `error`).
   */
  sync(api: ApiClient, { full = false } = {}): Promise<SyncResult | null> {
    if (this.#inFlight && !full) return this.#inFlight;
    const fullNow = full || !this.#cursor || Date.now() - this.#fullAt > FULL_SYNC_EVERY_MS;
    const owner = this.#owner;
    this.#localDuringSync.clear();
    this.#set({ syncing: true });

    const request = api.sync(fullNow ? undefined : this.#cursor).then(
      res => {
        if (this.#inFlight === request && owner === this.#owner) this.#merge(res);
        return res;
      },
      (err: unknown) => {
        if (this.#inFlight === request) this.#set({ syncing: false, error: err instanceof Error ? err : new Error(String(err)) });
        throw err;
      }
    ).finally(() => {
      if (this.#inFlight === request) this.#inFlight = null;
    });
    this.#inFlight = request;
    return request;
  }

  /** Syncs if the copy is older than `maxAgeMs` (and no sync is running). */
  ensureFresh(api: ApiClient, maxAgeMs = 60_000) {
    if (this.#inFlight) return;
    if (Date.now() - this.#snapshot.syncedAt < maxAgeMs) return;
    this.sync(api).catch(() => { /* kept in `error`; auth errors open the sign-in dialog */ });
  }

  /** A transaction saved, edited, marked repaid or restored by this person. */
  upsert(t: Transaction) {
    this.#localDuringSync.set(t.id, t);
    const current = this.#txns.get(t.id);
    if (current && current.updatedAt > t.updatedAt) return;
    this.#txns.set(t.id, t);
    this.#changed();
  }

  /** A transaction this person deleted. */
  remove(id: string) {
    this.#localDuringSync.set(id, null);
    if (this.#txns.delete(id)) this.#changed();
  }

  #merge(res: SyncResult) {
    if (res.full) {
      this.#txns = new Map(res.transactions.map(t => [t.id, t]));
      this.#fullAt = Date.now();
    } else {
      for (const t of res.transactions) {
        const current = this.#txns.get(t.id);
        if (!current || current.updatedAt <= t.updatedAt) this.#txns.set(t.id, t);
      }
      for (const id of res.removed) this.#txns.delete(id);
    }
    // Keep this person's own saves that the server's answer predates.
    for (const [id, t] of this.#localDuringSync) {
      const merged = this.#txns.get(id);
      if (t === null) this.#txns.delete(id);
      else if (!merged || merged.updatedAt < t.updatedAt) this.#txns.set(id, t);
    }
    this.#localDuringSync.clear();
    this.#cursor = res.cursor;
    this.#publish({ config: res.config, partners: res.partners, user: res.user, syncedAt: Date.now(), syncing: false, error: null });
    this.#save();
  }

  #changed() {
    this.#publish({});
    this.#save();
  }

  #publish(patch: Partial<DataSnapshot>) {
    const txns = [...this.#txns.values()];
    this.#snapshot = { ...this.#snapshot, ...patch, txns, byId: new Map(this.#txns) };
    for (const l of this.#listeners) l();
  }

  #set(patch: Partial<DataSnapshot>) {
    this.#snapshot = { ...this.#snapshot, ...patch };
    for (const l of this.#listeners) l();
  }

  #reset() {
    this.#owner = '';
    this.#cursor = '';
    this.#fullAt = 0;
    this.#txns = new Map();
    this.#inFlight = null;
    this.#localDuringSync.clear();
    this.#snapshot = EMPTY;
    for (const l of this.#listeners) l();
  }

  /** Loads a saved copy for the current owner. False if it is someone else's or unreadable. */
  #loadFrom(raw: string): boolean {
    try {
      const p = JSON.parse(raw) as Persisted;
      if (!this.#owner || p.owner !== this.#owner || !Array.isArray(p.txns) || !p.config) return false;
      this.#cursor = p.cursor;
      this.#fullAt = p.fullAt;
      this.#txns = new Map(p.txns.map(t => [t.id, t]));
      this.#publish({ config: p.config, partners: p.partners, user: p.user, syncedAt: p.syncedAt, error: null });
      return true;
    } catch {
      return false;
    }
  }

  #save() {
    const { config, partners, user, syncedAt } = this.#snapshot;
    if (!config || !this.#owner) return;
    const data: Persisted = { owner: this.#owner, cursor: this.#cursor, fullAt: this.#fullAt, syncedAt, user, config, partners, txns: this.#snapshot.txns };
    try {
      localStorage.setItem(DATA_KEY, JSON.stringify(data));
    } catch {
      this.#removeSaved();   // too big or blocked: this tab keeps working from memory
    }
  }

  #removeSaved() {
    try { localStorage.removeItem(DATA_KEY); } catch { /* nothing saved */ }
  }
}

export const dataStore = new DataStore();
