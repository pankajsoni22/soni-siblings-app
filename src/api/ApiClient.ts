import { config } from '../config.ts';
import { ApiError } from './ApiError.ts';
import type { Action, ApiResponse, Entities, EntityName, Me, StoredRecord } from './types.ts';

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
 *   const items = await api.list('Items');          // StoredRecord<'Items'>[]
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

  list<E extends EntityName>(entity: E, options: { includeDeleted?: boolean } = {}): Promise<StoredRecord<E>[]> {
    return this.#call('list', { entity, ...options });
  }

  get<E extends EntityName>(entity: E, id: string, options: { includeDeleted?: boolean } = {}): Promise<StoredRecord<E>> {
    return this.#call('get', { entity, id, ...options });
  }

  create<E extends EntityName>(entity: E, data: Entities[E]): Promise<StoredRecord<E>> {
    return this.#call('create', { entity, data });
  }

  /** Fails with CONFLICT if someone changed the record after `expectedUpdatedAt`. */
  update<E extends EntityName>(
    entity: E,
    id: string,
    data: Partial<Entities[E]>,
    expectedUpdatedAt: string
  ): Promise<StoredRecord<E>> {
    return this.#call('update', { entity, id, data, expectedUpdatedAt });
  }

  /** Soft delete: the row stays in the Sheet with deleted = TRUE. */
  delete(entity: EntityName, id: string): Promise<{ id: string }> {
    return this.#call('delete', { entity, id });
  }

  restore<E extends EntityName>(entity: E, id: string): Promise<StoredRecord<E>> {
    return this.#call('restore', { entity, id });
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
