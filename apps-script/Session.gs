/**
 * App sessions, so people stay signed in for two weeks and across browser tabs.
 *
 * Signing in with Google gives a token that lasts one hour. The app swaps it once for a
 * session token signed by this script (HMAC-SHA256), valid SESSION_DAYS. Every request still
 * reads the Users tab, so removing someone or changing their role takes effect immediately,
 * whatever their session says.
 *
 * Token: "s1.<payload>.<signature>", payload = base64url JSON { e: email, n: name, x: expiry ms }.
 * The signing key is the Script Property SESSION_SECRET, created on first use.
 * To sign everyone out (for example if a device is lost), delete SESSION_SECRET in
 * Project Settings → Script Properties; everyone signs in with Google again.
 */
const SESSION_DAYS = 14;
const SESSION_PREFIX = 's1.';

/** Action handler. Only a fresh Google sign-in can start a session; sessions can't extend themselves. */
function startSession_(user) {
  if (user.via !== 'google') throw new ApiError('FORBIDDEN', 'Sign in with Google to start a session');
  const exp = Date.now() + SESSION_DAYS * 864e5;
  const payload = Utilities.base64EncodeWebSafe(JSON.stringify({ e: user.email, n: user.name, x: exp }));
  return {
    token: SESSION_PREFIX + payload + '.' + sign_(payload),
    exp,
    user: { email: user.email, name: user.name, role: user.role, isOwner: user.isOwner }
  };
}

/** { email, name } from a valid, unexpired session token, or throws AUTH_REQUIRED. */
function verifySession_(token) {
  const parts = token.slice(SESSION_PREFIX.length).split('.');
  if (parts.length !== 2 || !parts[0] || !equalStrings_(sign_(parts[0]), parts[1])) {
    throw new ApiError('AUTH_REQUIRED', 'Invalid session');
  }
  let data;
  try { data = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString()); }
  catch (_) { throw new ApiError('AUTH_REQUIRED', 'Invalid session'); }
  if (!data || typeof data.e !== 'string' || !(Number(data.x) > Date.now())) {
    throw new ApiError('AUTH_REQUIRED', 'Session expired');
  }
  return { email: data.e.toLowerCase(), name: typeof data.n === 'string' ? data.n : '' };
}

function sign_(payload) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, sessionSecret_()));
}

function sessionSecret_() {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty('SESSION_SECRET');
  if (!secret) {
    withLock_(() => {
      secret = props.getProperty('SESSION_SECRET');
      if (!secret) {
        secret = Utilities.getUuid() + Utilities.getUuid();
        props.setProperty('SESSION_SECRET', secret);
      }
    });
  }
  return secret;
}

/** Compares without stopping at the first difference, so timing doesn't reveal the signature. */
function equalStrings_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
