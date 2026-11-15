import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ApiError } from '../../api/ApiError.ts';
import { useApi } from '../../api/useApi.ts';
import { dataStore } from '../../data/store.ts';
import { useData } from '../../data/useData.ts';
import { useToast } from '../toastContext.ts';

function ago(ms: number, now: number): string {
  const min = Math.floor((now - ms) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} h ago` : 'over a day ago';
}

/**
 * Shows when the data was last brought up to date, and reloads everything from the Sheet on
 * click (a full refresh, not just recent changes). `compact` shows only the icon.
 */
export default function SyncButton({ compact = false }: { compact?: boolean }) {
  const api = useApi();
  const toast = useToast();
  const { syncedAt, syncing } = useData();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const status = syncing ? 'Updating…' : syncedAt ? `Updated ${ago(syncedAt, Math.max(now, syncedAt))}` : 'Not loaded yet';

  async function refresh() {
    try {
      await dataStore.sync(api, { full: true });
      toast('Data refreshed from the Sheet');
    } catch (err) {
      if (!ApiError.is(err, 'AUTH_REQUIRED')) toast(err instanceof Error ? err.message : 'Could not refresh', 'error');
    }
  }

  return (
    <button type="button" className={`sync-btn${compact ? ' icon-btn icon-btn-plain' : ''}`} onClick={() => void refresh()}
      disabled={syncing} aria-label={compact ? `Refresh data. ${status}` : undefined} title={compact ? status : 'Reload all data from the Sheet'}>
      <RefreshCw size={compact ? 18 : 15} aria-hidden="true" className={syncing ? 'spin' : undefined} />
      {!compact && <span><span className="sync-label">Refresh</span><span className="sync-status" aria-live="polite">{status}</span></span>}
    </button>
  );
}
