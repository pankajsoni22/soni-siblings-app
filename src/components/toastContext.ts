import { createContext, useContext } from 'react';

export type ToastKind = 'info' | 'error';
export type ShowToast = (message: string, kind?: ToastKind) => void;

export const ToastContext = createContext<ShowToast>(() => {});

/** const toast = useToast(); toast('Saved'); toast('Could not save', 'error'); */
export function useToast(): ShowToast {
  return useContext(ToastContext);
}
