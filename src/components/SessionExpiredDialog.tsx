import SignInButton from '../auth/SignInButton.tsx';

export default function SessionExpiredDialog() {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="expired-title">
      <div className="card center">
        <h1 id="expired-title">Session expired</h1>
        <p className="muted">Sign in again to keep working. Nothing on this page has been lost.</p>
        <SignInButton />
      </div>
    </div>
  );
}
