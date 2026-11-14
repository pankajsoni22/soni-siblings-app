import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiClient } from './ApiClient.ts';
import { useApi } from './useApi.ts';

export interface QueryState<T> {
  /** The latest loaded data. Kept while a reload is in flight, so screens don't flash empty. */
  data: T | undefined;
  /** The error of the latest load, if it failed. */
  error: Error | undefined;
  loading: boolean;
  reload: () => void;
}

/**
 * Loads data when `key` changes (or `reload()` is called) and ignores answers that arrive after
 * a newer request started. `key` must capture every input of `load`.
 *
 *   const { data, error, loading, reload } = useQuery(`report:${from}:${to}`, api => api.report(from, to));
 */
export function useQuery<T>(key: string, load: (api: ApiClient) => Promise<T>): QueryState<T> {
  const api = useApi();
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; });

  const [nonce, setNonce] = useState(0);
  const requestKey = `${key}#${nonce}`;
  const [result, setResult] = useState<{ key: string; data?: T; error?: Error }>({ key: '' });

  useEffect(() => {
    let current = true;
    loadRef.current(api).then(
      data => { if (current) setResult({ key: requestKey, data }); },
      (err: unknown) => {
        if (current) setResult(prev => ({ key: requestKey, data: prev.data, error: err instanceof Error ? err : new Error(String(err)) }));
      }
    );
    return () => { current = false; };
  }, [api, requestKey]);

  const reload = useCallback(() => setNonce(n => n + 1), []);
  const loading = result.key !== requestKey;
  return { data: result.data, error: loading ? undefined : result.error, loading, reload };
}
