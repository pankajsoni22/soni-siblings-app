import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiClient } from '../api/ApiClient.ts';
import { ApiError } from '../api/ApiError.ts';
import type { Me } from '../api/types.ts';
import { config } from '../config.ts';
import { AuthContext, type AuthContextValue, type AuthStatus, type Session } from './authContext.ts';
import { decodeJwt, getGsi, waitForGsi } from './gsi.ts';

// Google Identity Services must be initialized once per page, even under StrictMode's double effects.
let gsiInitialized = false;
let onCredential: (response: google.accounts.id.CredentialResponse) => void = () => {};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [gsiReady, setGsiReady] = useState(false);
  const [error, setError] = useState('');
  const meRef = useRef<Me | null>(null);

  const handleCredential = useCallback(async ({ credential }: google.accounts.id.CredentialResponse) => {
    const p = decodeJwt(credential);
    const next: Session = {
      token: credential,
      exp: p.exp * 1000,
      profile: { email: p.email, name: p.name, picture: p.picture }
    };
    setSession(next);
    setError('');

    // Same person signing in again after expiry: resume without remounting the app.
    if (meRef.current && meRef.current.email === p.email.toLowerCase()) {
      setStatus('ready');
      return;
    }

    setStatus('checking');
    try {
      const user = await new ApiClient({ credentials: next }).me();   // confirms the allow-list
      meRef.current = user;
      setMe(user);
      setStatus('ready');
    } catch (err) {
      if (ApiError.is(err, 'FORBIDDEN')) {
        setStatus('forbidden');
      } else {
        setSession(null);
        setError(err instanceof Error ? err.message : 'Sign-in failed');
        setStatus('signedOut');
      }
    }
  }, []);

  useEffect(() => {
    onCredential = response => { void handleCredential(response); };
  }, [handleCredential]);

  useEffect(() => {
    let cancelled = false;
    waitForGsi()
      .then(gsi => {
        if (cancelled) return;
        if (!gsiInitialized) {
          gsi.initialize({
            client_id: config.googleClientId,
            auto_select: true,               // silent sign-in for returning users
            cancel_on_tap_outside: false,
            callback: response => onCredential(response)
          });
          gsiInitialized = true;
          gsi.prompt();                      // One Tap, if available
        }
        setGsiReady(true);
        setStatus(s => (s === 'loading' ? 'signedOut' : s));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Google sign-in did not load';
        setError(`${message}. Disable blockers for accounts.google.com or try another browser.`);
        setStatus('signedOut');
      });
    return () => { cancelled = true; };
  }, []);

  const expire = useCallback(() => {
    setStatus(s => (s === 'ready' || s === 'expired' ? 'expired' : 'signedOut'));
    getGsi()?.prompt();
  }, []);

  const signOut = useCallback(() => {
    getGsi()?.disableAutoSelect();
    window.location.reload();             // drops the in-memory token and all app state
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, session, me, gsiReady, error, expire, signOut }),
    [status, session, me, gsiReady, error, expire, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
