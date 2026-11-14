import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ToastContext, type ToastKind, type ToastOptions } from './toastContext.ts';

interface Toast {
  message: string;
  kind: ToastKind;
  options: ToastOptions;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setToast(null);
  }, []);

  const show = useCallback((message: string, kind: ToastKind = 'info', options: ToastOptions = {}) => {
    setToast({ message, kind, options });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), options.durationMs ?? 4000);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const action = toast?.options.actionLabel && toast.options.onAction ? toast.options : null;

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast" data-kind={toast?.kind} role="status" aria-live="polite" hidden={!toast}>
        <span>{toast?.message}</span>
        {action && (
          <button type="button" className="toast-action" onClick={() => { hide(); action.onAction?.(); }}>
            {action.actionLabel}
          </button>
        )}
      </div>
    </ToastContext.Provider>
  );
}
