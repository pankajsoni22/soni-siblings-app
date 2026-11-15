import { useMemo } from 'react';
import { useAuth } from '../auth/useAuth.ts';
import { dataStore } from '../data/store.ts';
import { ApiClient } from './ApiClient.ts';
import type { Action, Transaction } from './types.ts';

/** Applies a successful write to the local copy, so screens update without another server call. */
function applyWrite(action: Action, payload: object, result: unknown, client: ApiClient) {
  switch (action) {
    case 'saveTransaction':
    case 'setRepaid':
    case 'restoreTransaction':
      dataStore.upsert(result as Transaction);
      break;
    case 'deleteTransaction':
      dataStore.remove((payload as { id: string }).id);
      break;
    case 'savePartners':
    case 'saveSettings':
      dataStore.sync(client).catch(() => { /* retried by the next sync */ });   // picks up config and partners
      break;
    default:
      break;
  }
}

/**
 * Returns an ApiClient bound to the current session. On an expired or rejected token it
 * opens the re-sign-in dialog and rethrows, so callers only handle other errors.
 * Successful writes update the local copy (src/data/store.ts).
 */
export function useApi(): ApiClient {
  const { session, expire } = useAuth();
  return useMemo(
    () => new ApiClient({ credentials: session, onAuthExpired: expire, onWrite: applyWrite }),
    [session, expire]
  );
}
