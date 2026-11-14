import { Handshake, LayoutDashboard, Plus, ReceiptText, Settings, UserCog, type LucideIcon } from 'lucide-react';
import type { Action } from '../../api/types.ts';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Shown only to roles allowed to call this action. */
  action: Action;
  end?: boolean;
  group: 'main' | 'admin';
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, action: 'report', end: true, group: 'main' },
  { to: '/transactions', label: 'Transactions', icon: ReceiptText, action: 'listTransactions', end: true, group: 'main' },
  { to: '/transactions/new', label: 'New entry', icon: Plus, action: 'saveTransaction', group: 'main' },
  { to: '/partners', label: 'Partners', icon: Handshake, action: 'listPartners', group: 'admin' },
  { to: '/users', label: 'Users', icon: UserCog, action: 'listUsers', group: 'admin' },
  { to: '/settings', label: 'Settings', icon: Settings, action: 'saveSettings', group: 'admin' }
];

/** "Pankaj Soni" → "PS", "pankaj@gmail.com" → "P". */
export function initialsOf(nameOrEmail: string | undefined): string {
  const name = (nameOrEmail ?? '').split('@')[0] ?? '';
  const words = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return (words.length > 1 ? `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}` : (words[0] ?? '?').slice(0, 1)).toUpperCase();
}
