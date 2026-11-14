import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ToastContext, type ToastKind } from './toastContext.ts';

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; kind: ToastKind } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback((message: string, kind: ToastKind = 'info') => {
    setToast({ message, kind });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast" data-kind={toast?.kind} role="status" aria-live="polite" hidden={!toast}>
        {toast?.message}
      </div>
    </ToastContext.Provider>
  );
}
