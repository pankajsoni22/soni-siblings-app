import SignInButton from '../auth/SignInButton.tsx';
import { useAuth } from '../auth/useAuth.ts';

export default function SignInPage() {
  const { error } = useAuth();

  return (
    <section className="card center">
      <h1>Welcome</h1>
      <p className="muted">Sign in with your Google account to continue.</p>
      <SignInButton />
      {error && <p className="error-text">{error}</p>}
    </section>
  );
}
