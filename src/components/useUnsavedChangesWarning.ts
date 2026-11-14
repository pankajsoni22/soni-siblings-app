import { useEffect } from 'react';

/**
 * While `dirty`, closing or reloading the tab asks for confirmation (the browser shows its own
 * wording). In-app navigation uses Cancel buttons and needs no prompt.
 */
export function useUnsavedChangesWarning(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);
}
