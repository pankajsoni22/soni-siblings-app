import { describe, expect, it } from 'vitest';
import { parseStored } from './sessionStore.ts';

const now = Date.parse('2026-11-15T10:00:00Z');
const valid = {
  session: { token: 's1.abc.def', exp: now + 14 * 864e5, profile: { email: 'a@gmail.com', name: 'A' } },
  me: { email: 'a@gmail.com', name: 'A', role: 'ADMIN', isOwner: true }
};

describe('parseStored', () => {
  it('accepts a well-formed unexpired session', () => {
    expect(parseStored(JSON.stringify(valid), now)?.me.role).toBe('ADMIN');
  });

  it('rejects missing, malformed and incomplete values', () => {
    expect(parseStored(null, now)).toBeNull();
    expect(parseStored('not json', now)).toBeNull();
    expect(parseStored('null', now)).toBeNull();
    expect(parseStored(JSON.stringify({ session: valid.session }), now)).toBeNull();
    expect(parseStored(JSON.stringify({ ...valid, session: { ...valid.session, token: 1 } }), now)).toBeNull();
  });

  it('treats a session within 5 minutes of expiry as expired', () => {
    const soon = { ...valid, session: { ...valid.session, exp: now + 4 * 60_000 } };
    expect(parseStored(JSON.stringify(soon), now)).toBeNull();
    const later = { ...valid, session: { ...valid.session, exp: now + 6 * 60_000 } };
    expect(parseStored(JSON.stringify(later), now)).not.toBeNull();
  });
});
