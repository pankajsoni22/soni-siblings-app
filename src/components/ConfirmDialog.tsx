import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * A modal question with two buttons. Escape or a click on the backdrop cancels.
 * Focus starts on Cancel for destructive actions, on Confirm otherwise.
 */
export default function ConfirmDialog({ title, children, confirmLabel, danger = false, busy = false, onConfirm, onCancel }: {
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    (danger ? cancelRef : confirmRef).current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [danger, onCancel]);

  return (
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <div className="card dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>{title}</h2>
        {children && <div className="dialog-body">{children}</div>}
        <div className="dialog-actions">
          <button ref={cancelRef} type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button ref={confirmRef} type="button" className={`btn${danger ? ' btn-danger' : ''}`} onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
