import { useEffect, useId, useRef } from 'react';
import type { Transaction } from '../api/types.ts';
import { useQuery } from '../api/useQuery.ts';
import { actionLabel, describeChanges } from '../lib/history.ts';
import DateText from './DateText.tsx';
import { ErrorState, Loading } from './States.tsx';

/** Admin only: every recorded change to one transaction, newest first. */
export default function HistoryDialog({ txn, onClose }: { txn: Transaction; onClose: () => void }) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const history = useQuery(`history:${txn.id}:${txn.updatedAt}`, api => api.getHistory(txn.id));

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card dialog history-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="chart-head">
          <h2 id={titleId}>History · {txn.customerName}</h2>
          <button ref={closeRef} type="button" className="link-button" onClick={onClose}>Close</button>
        </div>
        {history.error ? <ErrorState error={history.error} onRetry={history.reload} />
          : !history.data ? <Loading />
            : (
              <ol className="history">
                {history.data.map((h, i) => {
                  const lines = describeChanges(h);
                  return (
                    <li key={`${h.timestamp}-${i}`}>
                      <div className="history-head">
                        <strong>{actionLabel(h)}</strong>
                        <span className="muted">{h.email} · <DateText value={h.timestamp} /></span>
                      </div>
                      {lines.length > 0 && <ul className="history-lines">{lines.map(l => <li key={l}>{l}</li>)}</ul>}
                    </li>
                  );
                })}
              </ol>
            )}
      </div>
    </div>
  );
}
