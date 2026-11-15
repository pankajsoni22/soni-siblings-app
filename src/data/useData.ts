import { useEffect, useSyncExternalStore } from 'react';
import { useApi } from '../api/useApi.ts';
import { dataStore, type DataSnapshot } from './store.ts';

/** The local copy of transactions, settings and partners; re-renders when it changes. */
export function useData(): DataSnapshot {
  return useSyncExternalStore(dataStore.subscribe, dataStore.getSnapshot);
}

/** How often an open, visible app checks for other people's changes. */
const POLL_MS = 2 * 60_000;
/** Coming back to the app or opening a page syncs if the copy is older than this. */
const FRESH_MS = 60_000;

/**
 * Keeps the copy fresh while the app is open: on start, when the tab becomes visible again,
 * and every couple of minutes while it is visible. Mount once, in the app shell.
 */
export function useAutoSync() {
  const api = useApi();
  useEffect(() => {
    dataStore.ensureFresh(api, FRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') dataStore.ensureFresh(api, FRESH_MS); };
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') dataStore.ensureFresh(api, POLL_MS - 5_000); }, POLL_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [api]);
}
