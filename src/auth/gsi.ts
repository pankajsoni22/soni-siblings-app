// Helpers around Google Identity Services (loaded by a <script> tag in index.html).

export type Gsi = typeof google.accounts.id;

/** The GSI API, or undefined while the script is still loading or was blocked. */
export function getGsi(): Gsi | undefined {
  return (window as Window & { google?: typeof google }).google?.accounts?.id;
}

export function waitForGsi(timeoutMs = 10_000): Promise<Gsi> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      const gsi = getGsi();
      if (gsi) resolve(gsi);
      else if (Date.now() - started > timeoutMs) reject(new Error('Google sign-in did not load'));
      else window.setTimeout(check, 50);
    };
    check();
  });
}

export interface GoogleIdTokenPayload {
  email: string;
  name?: string;
  picture?: string;
  /** Expiry, epoch seconds. */
  exp: number;
}

/** Reads the token payload for display only. The backend does the real verification. */
export function decodeJwt(token: string): GoogleIdTokenPayload {
  const b64 = (token.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as GoogleIdTokenPayload;
}
