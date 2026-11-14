import { LogOut } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { ROLE_LABELS } from '../../api/types.ts';
import { can } from '../../auth/permissions.ts';
import { useAuth } from '../../auth/useAuth.ts';
import Brand from './Brand.tsx';
import { NAV_ITEMS, initialsOf } from './navItems.ts';

/** Computer screens: brand, navigation by role, and the signed-in user with sign-out. */
export default function Sidebar() {
  const { me, session, signOut } = useAuth();
  const items = NAV_ITEMS.filter(i => can(me?.role, i.action));
  const main = items.filter(i => i.group === 'main');
  const admin = items.filter(i => i.group === 'admin');
  const name = session?.profile.name ?? me?.name ?? me?.email;

  return (
    <aside className="sidebar" aria-label="Sidebar">
      <Brand />
      <nav aria-label="Main" className="nav-section">
        {main.map(i => (
          <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <i.icon size={18} aria-hidden="true" /> {i.label}
          </NavLink>
        ))}
      </nav>
      {admin.length > 0 && (
        <nav aria-label="Admin" className="nav-section">
          <span className="nav-heading">Admin</span>
          {admin.map(i => (
            <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <i.icon size={18} aria-hidden="true" /> {i.label}
            </NavLink>
          ))}
        </nav>
      )}
      <div className="sidebar-user">
        <span className="avatar" aria-hidden="true">{initialsOf(name)}</span>
        <span className="sidebar-user-text">
          <span className="sidebar-user-name">{name}</span>
          <span className="sidebar-user-role">{me ? ROLE_LABELS[me.role] : ''}{me?.isOwner ? ' · Owner' : ''}</span>
        </span>
        <button type="button" className="icon-btn icon-btn-plain" onClick={signOut} aria-label="Sign out" title="Sign out">
          <LogOut size={18} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
