import type { ReactNode } from 'react';
import type { Action } from '../api/types.ts';
import { EmptyState } from '../components/States.tsx';
import { can } from './permissions.ts';
import { useAuth } from './useAuth.ts';

/**
 * Renders children only if the signed-in role may call `action`. This only tidies the UI:
 * the server refuses the request anyway.
 */
export default function RequireRole({ action, children }: { action: Action; children: ReactNode }) {
  const { me } = useAuth();
  if (!can(me?.role, action)) {
    return <EmptyState title="Not available for your role">Ask an admin if you need access to this page.</EmptyState>;
  }
  return <>{children}</>;
}
