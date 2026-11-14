import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.ts';
import { config } from '../config.ts';

export default function TopBar() {
  const { session, signOut } = useAuth();

  return (
    <header className="topbar">
      <Link to="/" className="brand">{config.appName}</Link>
      {session && (
        <div className="user-box">
          <span>{session.profile.name ?? session.profile.email}</span>
          <button type="button" className="btn btn-ghost" onClick={signOut}>Sign out</button>
        </div>
      )}
    </header>
  );
}
