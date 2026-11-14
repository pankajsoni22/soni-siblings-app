import { createContext } from 'react';
import type { Credentials } from '../api/ApiClient.ts';
import type { Me } from '../api/types.ts';

/**
 * loading    Google sign-in script not ready yet
 * signedOut  show the sign-in page
 * checking   got a Google token, asking the backend whether this email is allowed
 * forbidden  signed in, but not on the allow-list
 * ready      allowed; `me` is set
 * expired    was ready, token expired; app stays mounted under a re-sign-in dialog
 */
export type AuthStatus = 'loading' | 'signedOut' | 'checking' | 'forbidden' | 'ready' | 'expired';

export interface Profile {
  email: string;
  name?: string;
  picture?: string;
}

export interface Session extends Credentials {
  profile: Profile;
}

export interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  me: Me | null;
  gsiReady: boolean;
  error: string;
  expire: () => void;
  signOut: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
