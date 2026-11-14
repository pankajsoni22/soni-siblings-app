import { config } from '../config.ts';
import { ApiError } from './ApiError.ts';
import type { Action, ApiResponse, AppUser, Me, Role } from './types.ts';

export interface Credentials {
  token: string;
  /** Token expiry, epoch milliseconds. */
  exp: number;
}

interface ApiClientOptions {
  credentials: Credentials | null;
  /** Called when the token is missing, about to expire, or rejected by the server. */
  onAuthExpired?: () => void;
}

const EXPIRY_MARGIN_MS = 60_000;

/**
 * Typed client for the Apps Script API. Every method resolves with the response `data`
 * or rejects with an ApiError. In components, get an instance from the useApi() hook.
 *
 *   const api = useApi();
 *   const users = await api.listUsers();            // AppUser[]
 */
export class ApiClient {
  readonly #credentials: Credentials | null;
  readonly #onAuthExpired: () => void;

  constructor({ credentials, onAuthExpired = () => {} }: ApiClientOptions) {
    this.#credentials = credentials;
    this.#onAuthExpired = onAuthExpired;
  }

  me(): Promise<Me> {
    return this.#call('me', {});
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
        redirect: 'follow'
      });
    } catch {
      throw new ApiError('NETWORK', 'Could not reach the server. Check your connection.');
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
    return json.data;
  }
}
