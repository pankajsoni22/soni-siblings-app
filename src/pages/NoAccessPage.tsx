import { ShieldX } from 'lucide-react';
import { useAuth } from '../auth/useAuth.ts';
import Brand from '../components/shell/Brand.tsx';

export default function NoAccessPage() {
  const { session, signOut } = useAuth();
  return (
    <main id="main" className="auth-main" style={{ minHeight: '100vh' }}>
      <div className="auth-card card">
        <Brand to={null} />
        <span className="stat-icon" style={{ width: 52, height: 52, borderRadius: 16, background: 'var(--danger-soft)', color: 'var(--danger)' }}>
          <ShieldX size={26} aria-hidden="true" />
        </span>
        <div>
          <h1>No access</h1>
          <p className="muted">
            {session?.profile.email} isn't on this app's list. Ask an admin to add you, then sign in again.
          </p>
        </div>
        <button type="button" className="btn" onClick={signOut}>Sign out</button>
      </div>
    </main>
  );
}
