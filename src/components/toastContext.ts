import { createContext, useContext } from 'react';

export type ToastKind = 'info' | 'error';

export interface ToastOptions {
  /** A button in the toast, e.g. "Undo". */
  actionLabel?: string;
  onAction?: () => void;
  /** How long the toast stays, in ms (default 4000). */
  durationMs?: number;
}

export type ShowToast = (message: string, kind?: ToastKind, options?: ToastOptions) => void;

export const ToastContext = createContext<ShowToast>(() => {});

/**
 * const toast = useToast();
 * toast('Saved');
 * toast('Could not save', 'error');
 * toast('Deleted', 'info', { actionLabel: 'Undo', onAction: undo, durationMs: 10_000 });
 */
export function useToast(): ShowToast {
  return useContext(ToastContext);
}
