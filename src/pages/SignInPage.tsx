import { ChartColumn, History, ShieldCheck, Smartphone } from 'lucide-react';
import SignInButton from '../auth/SignInButton.tsx';
import { useAuth } from '../auth/useAuth.ts';
import Brand from '../components/shell/Brand.tsx';

/** Full-screen sign-in: a brand panel on computers, a centred card on phones. */
export default function SignInPage() {
  const { error } = useAuth();
  return (
    <div className="auth">
      <section className="auth-panel" aria-hidden="true">
        <Brand to={null} />
        <div>
          <p className="auth-headline">Every loan, every rupee of commission, in one place.</p>
          <ul className="auth-points">
            <li><ChartColumn size={20} /> Live totals by month, quarter and financial year</li>
            <li><Smartphone size={20} /> Record entries from your phone in seconds</li>
            <li><History size={20} /> Every change logged with who and when</li>
            <li><ShieldCheck size={20} /> Only people you invite can sign in</li>
          </ul>
        </div>
        <p className="auth-foot">Private to the partners. Data stays in your own Google Sheet.</p>
      </section>
      <main id="main" className="auth-main">
        <div className="auth-card">
          <Brand to={null} />
          <div>
            <h1>Welcome back</h1>
            <p className="muted">Sign in with your Google account to continue.</p>
          </div>
          <SignInButton />
          {error && <p className="error-text" role="alert">{error}</p>}
          <p className="auth-note"><ShieldCheck size={15} aria-hidden="true" /> Only invited accounts can open the app</p>
        </div>
      </main>
    </div>
  );
}
