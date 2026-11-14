import { useAuth } from '../auth/useAuth.ts';

export default function NoAccessPage() {
  const { session, signOut } = useAuth();

  return (
    <section className="card center">
      <h1>No access</h1>
      <p className="muted">
        Your account ({session?.profile.email}) doesn't have access to this app.
      </p>
      <button type="button" className="btn" onClick={signOut}>Sign out</button>
    </section>
  );
}
