import { NavLink } from 'react-router-dom';
import type { Action } from '../api/types.ts';
import { can } from '../auth/permissions.ts';
import { useAuth } from '../auth/useAuth.ts';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  /** Shown only to roles allowed to call this action. */
  action: Action;
  end?: boolean;
}

const ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: '▦', action: 'report', end: true },
  { to: '/transactions', label: 'Transactions', icon: '☰', action: 'listTransactions', end: true },
  { to: '/transactions/new', label: 'New entry', icon: '+', action: 'saveTransaction' },
  { to: '/partners', label: 'Partners', icon: '◔', action: 'listPartners' },
  { to: '/users', label: 'Users', icon: '☺', action: 'listUsers' },
  { to: '/settings', label: 'Settings', icon: '⚙', action: 'saveSettings' }
];

/** Side menu on wide screens, bottom bar on phones. Items depend on the signed-in role. */
export default function Nav() {
  const { me } = useAuth();
  const items = ITEMS.filter(i => can(me?.role, i.action));

  return (
    <nav className="nav" aria-label="Main">
      <ul>
        {items.map(i => (
          <li key={i.to}>
            <NavLink to={i.to} end={i.end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <span className="nav-icon" aria-hidden="true">{i.icon}</span>
              <span className="nav-label">{i.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
