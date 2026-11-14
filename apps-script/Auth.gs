/**
 * Who is calling, and are they allowed in at all.
 *
 * Script Properties (Project Settings → Script Properties):
 *   GOOGLE_CLIENT_ID  OAuth Web client ID; must match VITE_GOOGLE_CLIENT_ID exactly
 *   OWNER_EMAIL       the Sheet owner's Google email; always an admin, can never be removed
 */

/** Returns { email, name, role, isOwner } or throws AUTH_REQUIRED / FORBIDDEN. */
function authenticate_(idToken) {
  const info = verifyGoogleToken_(idToken);
  const email = String(info.email).toLowerCase();
  const access = lookupAccess_(email);
  if (!access) throw new ApiError('FORBIDDEN', 'Your account does not have access');
  return { email, name: info.name || email, role: access.role, isOwner: access.isOwner };
}

/**
 * Checks the token with Google. A verified token is cached for at most 5 minutes;
 * the Users tab is read on every request, so removing someone takes effect immediately.
 */
function verifyGoogleToken_(idToken) {
  if (!idToken || typeof idToken !== 'string') throw new ApiError('AUTH_REQUIRED', 'Sign in required');
  const cache = CacheService.getScriptCache();
  const key = 'tok_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken));

  let info = JSON.parse(cache.get(key) || 'null');
  if (!info) {
    const res = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
      { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new ApiError('AUTH_REQUIRED', 'Invalid token');
    info = JSON.parse(res.getContentText());
    const clientId = PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID');
    if (!clientId) throw new Error('Script Property GOOGLE_CLIENT_ID is not set');
    if (info.aud !== clientId) throw new ApiError('AUTH_REQUIRED', 'Wrong audience');
    if (!['accounts.google.com', 'https://accounts.google.com'].includes(info.iss)) throw new ApiError('AUTH_REQUIRED', 'Wrong issuer');
    if (String(info.email_verified) !== 'true') throw new ApiError('AUTH_REQUIRED', 'Email not verified');
    const ttl = Math.min(300, Number(info.exp) - Math.floor(Date.now() / 1000));
    if (ttl > 0) cache.put(key, JSON.stringify(info), ttl);
  }
  if (Number(info.exp) * 1000 < Date.now()) throw new ApiError('AUTH_REQUIRED', 'Token expired');
  return info;
}

function ownerEmail_() {
  const owner = (PropertiesService.getScriptProperties().getProperty('OWNER_EMAIL') || '').trim().toLowerCase();
  if (!owner) throw new Error('Script Property OWNER_EMAIL is not set');
  return owner;
}

/**
 * The owner is always an admin, which is what guarantees the app always has one.
 * Everyone else needs an active row in the Users tab.
 */
function lookupAccess_(email) {
  if (email === ownerEmail_()) return { role: 'ADMIN', isOwner: true };
  const row = findUserRow_(readTable_('Users'), email);
  return row && row.record.active ? { role: row.record.role, isOwner: false } : null;
}
