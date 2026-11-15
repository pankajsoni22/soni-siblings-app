import { config } from '../config.ts';
import { ApiError } from './ApiError.ts';
import type {
  Action, ApiResponse, AppConfig, AppUser, DeleteResult, HistoryEntry, Me, Partner, PartnerInput,
  RepaidStatus, Report, Role, SessionGrant, ShareInput, SyncResult, Transaction, TransactionInput
} from './types.ts';

export interface Credentials {
  token: string;
  /** Token expiry, epoch milliseconds. */
  exp: number;
}

interface ApiClientOptions {
  credentials: Credentials | null;
  /** Called when the token is missing, about to expire, or rejected by the server. */
  onAuthExpired?: () => void;
  /** Called after every successful write with its result, e.g. to update the local copy. */
  onWrite?: (action: Action, payload: object, result: unknown, client: ApiClient) => void;
}

const EXPIRY_MARGIN_MS = 60_000;
/** Apps Script normally answers in 1–3 s; give up after this. */
const REQUEST_TIMEOUT_MS = 30_000;
const WRITE_ACTIONS = new Set<Action>([
  'saveTransaction', 'setRepaid', 'deleteTransaction', 'restoreTransaction', 'savePartners', 'saveSettings', 'saveUser', 'removeUser'
]);

/**
 * Typed client for the Apps Script API. Every method resolves with the response `data`
 * or rejects with an ApiError. In components, get an instance from the useApi() hook.
 *
 *   const api = useApi();
 *   const txns = await api.listTransactions('2026-04-01', '2026-06-30');
 *
 * Who may call what is in src/auth/permissions.ts (mirrors the server's table).
 */
export class ApiClient {
  readonly #credentials: Credentials | null;
  readonly #onAuthExpired: () => void;
  readonly #onWrite: ApiClientOptions['onWrite'];

  constructor({ credentials, onAuthExpired = () => {}, onWrite }: ApiClientOptions) {
    this.#credentials = credentials;
    this.#onAuthExpired = onAuthExpired;
    this.#onWrite = onWrite;
  }

  me(): Promise<Me> {
    return this.#call('me', {});
  }

  /** Swaps a fresh Google token for a 14-day app session. Only works with a Google token. */
  startSession(): Promise<SessionGrant> {
    return this.#call('startSession', {});
  }

  /** Everything the app shows, or only what changed since `since` (a cursor from the last sync). */
  sync(since?: string): Promise<SyncResult> {
    return this.#call('sync', since ? { since } : {});
  }

  /** Default rate, active partners with default shares, and today's date (India time). */
  getConfig(): Promise<AppConfig> {
    return this.#call('getConfig', {});
  }

  // --- Transactions --------------------------------------------------------

  /** Transactions dated from..to (inclusive), newest first. includeDeleted is admin only. */
  listTransactions(from: string, to: string, options: { includeDeleted?: boolean } = {}): Promise<Transaction[]> {
    return this.#call('listTransactions', { from, to, ...options });
  }

  /** One transaction with its shares (deleted ones are NOT_FOUND). */
  getTransaction(id: string): Promise<Transaction> {
    return this.#call('getTransaction', { id });
  }

  /** Creates a transaction. The server calculates commission and earnings. */
  createTransaction(transaction: TransactionInput, shares: ShareInput[]): Promise<Transaction> {
    return this.#call('saveTransaction', { transaction, shares });
  }

  /** Updates a transaction. Fails with CONFLICT if someone saved it after `expectedUpdatedAt`. */
  updateTransaction(id: string, expectedUpdatedAt: string, transaction: TransactionInput, shares: ShareInput[]): Promise<Transaction> {
    return this.#call('saveTransaction', { id, expectedUpdatedAt, transaction, shares });
  }

  setRepaid(id: string, repaidStatus: RepaidStatus): Promise<Transaction> {
    return this.#call('setRepaid', { id, repaidStatus });
  }

  /** Soft delete. */
  deleteTransaction(id: string): Promise<DeleteResult> {
    return this.#call('deleteTransaction', { id });
  }

  /** Admins any time; others only for their own delete, within the undo window. */
  restoreTransaction(id: string): Promise<Transaction> {
    return this.#call('restoreTransaction', { id });
  }

  /** Admin only. Newest first. */
  getHistory(id: string): Promise<HistoryEntry[]> {
    return this.#call('getHistory', { id });
  }

  // --- Reports -------------------------------------------------------------

  report(from: string, to: string): Promise<Report> {
    return this.#call('report', { from, to });
  }

  // --- Admin ---------------------------------------------------------------

  /** Admin only. All partners, active and inactive, in partner order. */
  listPartners(): Promise<Partner[]> {
    return this.#call('listPartners', {});
  }

  /** Admin only. Saves the whole list; active default shares must total 100%. */
  savePartners(partners: PartnerInput[]): Promise<Partner[]> {
    return this.#call('savePartners', { partners });
  }

  /** Admin only. Returns the updated config. */
  saveSettings(defaultCommissionRatePct: number): Promise<AppConfig> {
    return this.#call('saveSettings', { defaultCommissionRatePct });
  }

  /** Admin only. Owner first, then active users, then removed ones. */
  listUsers(): Promise<AppUser[]> {
    return this.#call('listUsers', {});
  }

  /** Admin only. Adds a person, or changes their role and reactivates them. */
  saveUser(email: string, role: Role): Promise<AppUser> {
    return this.#call('saveUser', { email, role });
  }

  /** Admin only. Their access ends on their next request. The owner cannot be removed. */
  removeUser(email: string): Promise<AppUser> {
    return this.#call('removeUser', { email });
  }

  async #call<T>(action: Action, payload: object): Promise<T> {
    const creds = this.#credentials;
    if (!creds || Date.now() > creds.exp - EXPIRY_MARGIN_MS) {
      this.#onAuthExpired();
      throw new ApiError('AUTH_REQUIRED', 'Session expired, please sign in again');
    }

    let res: Response;
    try {
      res = await fetch(config.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // keep: application/json triggers a CORS preflight
        body: JSON.stringify({ action, token: creds.token, payload }),
        redirect: 'follow',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
    } catch (err) {
      const timedOut = err instanceof DOMException && err.name === 'TimeoutError';
      if (timedOut && WRITE_ACTIONS.has(action)) {
        // The server may have finished the write after we stopped waiting: retrying blindly could save twice.
        throw new ApiError('NETWORK', 'The server is taking too long. Your change may still have been saved; reload and check before trying again.');
      }
      throw new ApiError('NETWORK', timedOut
        ? 'The server is taking too long to answer. Please try again.'
        : navigator.onLine === false ? "You're offline. Check your connection and try again." : 'Could not reach the server. Check your connection.');
    }

    let json: ApiResponse<T>;
    try {
      json = (await res.json()) as ApiResponse<T>;
    } catch {
      // Usually means the deployment's access is not "Anyone" and Google returned a login page.
      throw new ApiError('SERVER', 'Unexpected response from the server');
    }

    if (!json.ok) {
      if (json.error.code === 'AUTH_REQUIRED') this.#onAuthExpired();
      throw new ApiError(json.error.code, json.error.message);
    }
    if (WRITE_ACTIONS.has(action)) this.#onWrite?.(action, payload, json.data, this);
    return json.data;
  }
}
