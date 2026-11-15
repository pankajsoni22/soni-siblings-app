import type { Me } from '../api/types.ts';
import type { Session } from './authContext.ts';

/**
 * The signed-in session, kept in localStorage so every tab shares it and it survives
 * closing the browser until it expires (14 days, set by the server).
 *
 * It holds the app's own session token, never a Google token. The server still checks the
 * Users list on every request, so a stored session gives no access once someone is removed.
 */
export const SESSION_KEY = 'soni-lending.session.v1';

/** Treat a session this close to expiry as already expired. */
const MARGIN_MS = 5 * 60_000;

export interface StoredSession {
  session: Session;
  me: Me;
}

function isStored(v: unknown): v is StoredSession {
  const s = v as StoredSession | null;
  return typeof s?.session?.token === 'string' && typeof s.session.exp === 'number'
    && typeof s.session.profile?.email === 'string' && typeof s.me?.email === 'string' && typeof s.me.role === 'string';
}

/** Parses a stored value; null when missing, malformed or expired. */
export function parseStored(raw: string | null, now = Date.now()): StoredSession | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return isStored(v) && v.session.exp - MARGIN_MS > now ? v : null;
  } catch {
    return null;
  }
}

export function loadSession(): StoredSession | null {
  try {
    return parseStored(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;              // storage blocked (private mode, site data disabled)
  }
}

export function saveSession(value: StoredSession): void {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(value)); } catch { /* this tab still works */ }
}

export function clearSession(): void {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* nothing stored */ }
}
