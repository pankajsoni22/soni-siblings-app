import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiClient } from '../api/ApiClient.ts';
import { ApiError } from '../api/ApiError.ts';
import type { Me } from '../api/types.ts';
import { config } from '../config.ts';
import { dataStore } from '../data/store.ts';
import { AuthContext, type AuthContextValue, type AuthStatus, type Session } from './authContext.ts';
import { decodeJwt, getGsi, waitForGsi } from './gsi.ts';
import { clearSession, loadSession, parseStored, saveSession, SESSION_KEY, type StoredSession } from './sessionStore.ts';

/** Written on sign-out so other open tabs sign out too. */
const SIGNOUT_KEY = 'soni-lending.signout';

// Google Identity Services must be initialized once per page, even under StrictMode's double effects.
let gsiInitialized = false;
let onCredential: (response: google.accounts.id.CredentialResponse) => void = () => {};

/**
 * Sign-in flow:
 * 1. A saved session (localStorage, shared by all tabs) opens the app at once; the role is
 *    re-checked in the background.
 * 2. Otherwise Google sign-in gives a 1-hour Google token, which is swapped once for a
 *    14-day app session (apps-script/Session.gs) and saved for every tab.
 * 3. When the session ends, the app stays open under a "sign in again" dialog.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(() => {
    const saved = loadSession();
    if (saved) dataStore.open(saved.me.email);   // the saved copy of the data shows at once
    else dataStore.clear();                      // no valid session: leave no business data on the device
    return saved;
  });
  const [status, setStatus] = useState<AuthStatus>(initial ? 'ready' : 'loading');
  const [session, setSession] = useState<Session | null>(initial?.session ?? null);
  const [me, setMe] = useState<Me | null>(initial?.me ?? null);
  const [gsiReady, setGsiReady] = useState(false);
  const [error, setError] = useState('');
  const meRef = useRef<Me | null>(initial?.me ?? null);
  const tokenRef = useRef<string | null>(initial?.session.token ?? null);

  const adopt = useCallback((stored: StoredSession) => {
    if (meRef.current && meRef.current.email !== stored.me.email) {
      window.location.reload();            // a different person: start from a clean app
      return;
    }
    dataStore.open(stored.me.email);
    meRef.current = stored.me;
    tokenRef.current = stored.session.token;
    setSession(stored.session);
    setMe(stored.me);
    setError('');
    setStatus('ready');
  }, []);

  const handleCredential = useCallback(async ({ credential }: google.accounts.id.CredentialResponse) => {
    const p = decodeJwt(credential);
    const profile = { email: p.email, name: p.name, picture: p.picture };
    const google: Session = { token: credential, exp: p.exp * 1000, profile };
    setError('');
    if (!meRef.current || meRef.current.email !== p.email.toLowerCase()) setStatus('checking');

    try {
      const grant = await new ApiClient({ credentials: google }).startSession();   // also confirms the allow-list
      const stored: StoredSession = { session: { token: grant.token, exp: grant.exp, profile }, me: grant.user };
      saveSession(stored);
      adopt(stored);
    } catch (err) {
      if (ApiError.is(err, 'FORBIDDEN')) {
        clearSession();
        dataStore.clear();
        setSession(google);                // NoAccessPage shows which account was refused
        setStatus('forbidden');
      } else {
        setSession(null);
        setError(err instanceof Error ? err.message : 'Sign-in failed');
        setStatus('signedOut');
      }
    }
  }, [adopt]);

  useEffect(() => {
    onCredential = response => { void handleCredential(response); };
  }, [handleCredential]);

  // Opened from a saved session: the first sync confirms access is still current (and brings the
  // data), without holding up the page. Later syncs keep the role up to date.
  useEffect(() => {
    if (!initial) return;
    dataStore.sync(new ApiClient({ credentials: initial.session }))
      .catch((err: unknown) => {
        if (ApiError.is(err, 'FORBIDDEN')) {
          clearSession();
          dataStore.clear();
          setStatus('forbidden');
        } else if (ApiError.is(err, 'AUTH_REQUIRED')) {
          clearSession();
          dataStore.clear();
          meRef.current = null;
          setSession(null);
          setMe(null);
          setStatus('signedOut');
          getGsi()?.prompt();
        }
        // NETWORK / SERVER: keep the session; the next request will show the problem.
      });
  }, [initial]);

  // A sync reports the current role: keep `me` (and the saved session) in step with it.
  // A sync refused with FORBIDDEN means this person was removed: drop everything they had.
  useEffect(() => dataStore.subscribe(() => {
    const { user, error: syncError } = dataStore.getSnapshot();
    if (ApiError.is(syncError, 'FORBIDDEN')) {
      clearSession();
      dataStore.clear();
      setStatus('forbidden');
      return;
    }
    const current = meRef.current;
    if (!user || !current || user.email !== current.email) return;
    if (user.role === current.role && user.name === current.name && user.isOwner === current.isOwner) return;
    meRef.current = user;
    setMe(user);
    const stored = loadSession();
    if (stored) saveSession({ ...stored, me: user });
  }), []);

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
          if (!loadSession()) gsi.prompt();  // One Tap, only when there is no saved session
        }
        setGsiReady(true);
        setStatus(s => (s === 'loading' ? 'signedOut' : s));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Google sign-in did not load';
        setError(`${message}. Disable blockers for accounts.google.com or try another browser.`);
        setStatus(s => (s === 'loading' ? 'signedOut' : s));
      });
    return () => { cancelled = true; };
  }, []);

  // Keep tabs in step: a sign-in in one tab signs in the others; a sign-out signs them all out.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SIGNOUT_KEY) {
        window.location.reload();
      } else if (e.key === SESSION_KEY) {
        const stored = parseStored(e.newValue);
        if (stored && stored.session.token !== tokenRef.current) adopt(stored);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [adopt]);

  const expire = useCallback(() => {
    const fresh = loadSession();           // another tab may already have signed in again
    if (fresh && fresh.session.token !== tokenRef.current) {
      adopt(fresh);
      return;
    }
    clearSession();
    dataStore.forgetSaved();               // stays on screen in this tab only, until they sign in again
    setStatus(s => (s === 'ready' || s === 'expired' ? 'expired' : 'signedOut'));
    getGsi()?.prompt();
  }, [adopt]);

  const signOut = useCallback(() => {
    clearSession();
    dataStore.clear();
    try { localStorage.setItem(SIGNOUT_KEY, String(Date.now())); } catch { /* other tabs find out on their next request */ }
    getGsi()?.disableAutoSelect();
    window.location.reload();             // drops the token and all app state
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, session, me, gsiReady, error, expire, signOut }),
    [status, session, me, gsiReady, error, expire, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
