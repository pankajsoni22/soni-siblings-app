import { Ellipsis, LogOut, Plus } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ROLE_LABELS } from '../../api/types.ts';
import { can } from '../../auth/permissions.ts';
import { useAuth } from '../../auth/useAuth.ts';
import Brand from './Brand.tsx';
import { NAV_ITEMS, initialsOf } from './navItems.ts';

/** Phones: a slim top bar. */
export function MobileTop() {
  const { me, session } = useAuth();
  return (
    <header className="mobile-top">
      <Brand />
      <span className="avatar" title={session?.profile.email} aria-label={`Signed in as ${me?.name ?? ''}`}>
        {initialsOf(session?.profile.name ?? me?.name ?? me?.email)}
      </span>
    </header>
  );
}

/** Phones: bottom tabs (Dashboard, Transactions, a raised New button, More). */
export function TabBar() {
  const { me, session, signOut } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();
  const items = NAV_ITEMS.filter(i => can(me?.role, i.action));
  const tabs = items.filter(i => i.group === 'main' && i.to !== '/transactions/new');
  const newItem = items.find(i => i.to === '/transactions/new');
  const more = items.filter(i => i.group === 'admin');
  const moreActive = more.some(i => pathname.startsWith(i.to));

  return (
    <>
      <nav className="tabbar" aria-label="Main">
        {tabs.slice(0, 1).map(i => <Tab key={i.to} to={i.to} end={i.end} label={i.label} Icon={i.icon} />)}
        {tabs.slice(1, 2).map(i => <Tab key={i.to} to={i.to} end={i.end} label={i.label} Icon={i.icon} />)}
        {newItem && (
          <NavLink to={newItem.to} className="tab" aria-label="New entry">
            <span className="tab-fab"><Plus size={24} aria-hidden="true" /></span>
          </NavLink>
        )}
        <button type="button" className={`tab${moreActive ? ' active' : ''}`} aria-haspopup="dialog" aria-expanded={moreOpen}
          onClick={() => setMoreOpen(true)}>
          <Ellipsis size={22} aria-hidden="true" />
          More
        </button>
      </nav>
      {moreOpen && (
        <MoreSheet onClose={() => setMoreOpen(false)}>
          <div className="sheet-user">
            <span className="avatar" aria-hidden="true">{initialsOf(session?.profile.name ?? me?.name)}</span>
            <span className="sidebar-user-text">
              <span className="sidebar-user-name">{session?.profile.name ?? me?.name}</span>
              <span className="sidebar-user-role">{session?.profile.email} · {me ? ROLE_LABELS[me.role] : ''}</span>
            </span>
          </div>
          {more.map(i => (
            <NavLink key={i.to} to={i.to} onClick={() => setMoreOpen(false)} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <i.icon size={20} aria-hidden="true" /> {i.label}
            </NavLink>
          ))}
          <button type="button" className="nav-link nav-button btn-danger-text" onClick={signOut}>
            <LogOut size={20} aria-hidden="true" /> Sign out
          </button>
        </MoreSheet>
      )}
    </>
  );
}

function Tab({ to, end, label, Icon }: { to: string; end?: boolean; label: string; Icon: (typeof NAV_ITEMS)[number]['icon'] }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
      <Icon size={22} aria-hidden="true" />
      {label}
    </NavLink>
  );
}

function MoreSheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('a, button')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="sheet-handle" aria-hidden="true" />
        <h2 id={titleId} className="visually-hidden">More</h2>
        {children}
      </div>
    </div>
  );
}
