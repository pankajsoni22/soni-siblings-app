import { useMemo } from 'react';
import { useAuth } from '../auth/useAuth.ts';
import { ApiClient } from './ApiClient.ts';

/**
 * Returns an ApiClient bound to the current session. On an expired or rejected token it
 * opens the re-sign-in dialog and rethrows, so callers only handle other errors.
 */
export function useApi(): ApiClient {
  const { session, expire } = useAuth();
  return useMemo(
    () => new ApiClient({ credentials: session, onAuthExpired: expire }),
    [session, expire]
  );
}
