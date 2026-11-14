// Backend tests. Run: npm run test:backend
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, tok, OWNER } = require('./harness.cjs');

const ok = res => { assert.equal(res.ok, true, JSON.stringify(res)); return res.data; };
const err = (res, code) => { assert.equal(res.ok, false, JSON.stringify(res)); assert.equal(res.error.code, code, JSON.stringify(res)); return res.error; };

function readyEnv(opts) {
  const env = makeEnv(opts);
  env.run('setup()');
  return env;
}

describe('setup', () => {
  test('creates every tab with headers, frozen and bold, and drops the empty Sheet1', () => {
    const env = readyEnv();
    const names = env.ss.getSheets().map(s => s.getName()).sort();
    assert.deepEqual(names, ['AuditLog', 'Partners', 'Settings', 'Shares', 'Transactions', 'Users']);
    assert.deepEqual(env.tab('Users')[0].slice(-3), ['email', 'role', 'active']);
    assert.equal(env.tab('Transactions')[0][0], 'id');
    assert.equal(env.ss.getSheetByName('Users').frozen, 1);
  });

  test('adds the owner as ADMIN and the default commission rate, once', () => {
    const env = readyEnv();
    env.run('setup()');
    const users = env.tab('Users').slice(1);
    assert.equal(users.length, 1);
    assert.equal(users[0].at(-3), OWNER);
    assert.equal(users[0].at(-2), 'ADMIN');
    const settings = env.tab('Settings').slice(1);
    assert.deepEqual(settings, [['defaultCommissionRatePct', '0.30']]);
  });

  test('refuses to run without OWNER_EMAIL', () => {
    const env = makeEnv({ props: { OWNER_EMAIL: '' } });
    assert.throws(() => env.run('setup()'), /OWNER_EMAIL/);
  });
});

describe('authentication', () => {
  test('rejects bad requests and bad tokens', () => {
    const env = readyEnv();
    err(env.rawPost({}), 'VALIDATION');
    err(env.rawPost({ postData: { contents: 'not json' } }), 'VALIDATION');
    err(env.rawPost({ postData: { contents: 'null' } }), 'VALIDATION');
    err(env.rawPost({ postData: { contents: '{}' } }), 'AUTH_REQUIRED');
    err(env.call('garbage', 'me'), 'AUTH_REQUIRED');
    err(env.call(`tok:${OWNER}:another-client`, 'me'), 'AUTH_REQUIRED');
  });

  test('refuses anyone not on the Users list', () => {
    const env = readyEnv();
    err(env.call(tok('stranger@gmail.com'), 'me'), 'FORBIDDEN');
  });

  test('the owner is an admin even with no Users row', () => {
    const env = makeEnv();
    env.run('setup()');
    env.ss.getSheetByName('Users').getRange(2, 1, 1, 11).setValues([Array(11).fill('')]);
    assert.deepEqual(ok(env.call(tok(OWNER), 'me')), { email: OWNER, name: 'owner', role: 'ADMIN', isOwner: true });
  });

  test('emails are matched case-insensitively', () => {
    const env = readyEnv();
    ok(env.call(tok(OWNER), 'saveUser', { email: '  Writer@Gmail.com ', role: 'USER_W' }));
    assert.equal(ok(env.call(tok('WRITER@gmail.com'), 'me')).role, 'USER_W');
  });

  test('a missing GOOGLE_CLIENT_ID is a server error, not an open door', () => {
    const env = readyEnv({ props: { GOOGLE_CLIENT_ID: '' } });
    err(env.call(tok(OWNER), 'me'), 'SERVER');
  });

  test('unknown actions are refused', () => {
    const env = readyEnv();
    err(env.call(tok(OWNER), 'dropTables'), 'VALIDATION');
    err(env.call(tok(OWNER), 'toString'), 'VALIDATION');
    err(env.call(tok(OWNER), '__proto__'), 'VALIDATION');
  });

  test('verified tokens are cached', () => {
    const env = readyEnv();
    for (let i = 0; i < 5; i++) ok(env.call(tok(OWNER), 'me'));
    assert.equal(env.fetches(), 1);
  });
});

describe('roles', () => {
  function team() {
    const env = readyEnv();
    ok(env.call(tok(OWNER), 'saveUser', { email: 'admin2@gmail.com', role: 'ADMIN' }));
    ok(env.call(tok(OWNER), 'saveUser', { email: 'writer@gmail.com', role: 'USER_W' }));
    ok(env.call(tok(OWNER), 'saveUser', { email: 'reader@gmail.com', role: 'USER_RO' }));
    return env;
  }

  test('each role signs in with its own role', () => {
    const env = team();
    assert.equal(ok(env.call(tok('admin2@gmail.com'), 'me')).role, 'ADMIN');
    assert.equal(ok(env.call(tok('writer@gmail.com'), 'me')).role, 'USER_W');
    const reader = ok(env.call(tok('reader@gmail.com'), 'me'));
    assert.deepEqual(reader, { email: 'reader@gmail.com', name: 'reader', role: 'USER_RO', isOwner: false });
  });

  test('only admins can manage users', () => {
    const env = team();
    for (const who of ['writer@gmail.com', 'reader@gmail.com']) {
      err(env.call(tok(who), 'listUsers'), 'FORBIDDEN');
      err(env.call(tok(who), 'saveUser', { email: 'x@gmail.com', role: 'ADMIN' }), 'FORBIDDEN');
      err(env.call(tok(who), 'removeUser', { email: 'reader@gmail.com' }), 'FORBIDDEN');
    }
    ok(env.call(tok('admin2@gmail.com'), 'saveUser', { email: 'new@gmail.com', role: 'USER_RO' }));
  });

  test('a role change applies on the next request', () => {
    const env = team();
    ok(env.call(tok(OWNER), 'saveUser', { email: 'writer@gmail.com', role: 'USER_RO' }));
    assert.equal(ok(env.call(tok('writer@gmail.com'), 'me')).role, 'USER_RO');
  });

  test('removing someone ends their access immediately, even with a cached token', () => {
    const env = team();
    ok(env.call(tok('writer@gmail.com'), 'me'));
    const removed = ok(env.call(tok(OWNER), 'removeUser', { email: 'writer@gmail.com' }));
    assert.equal(removed.active, false);
    err(env.call(tok('writer@gmail.com'), 'me'), 'FORBIDDEN');
    // removing again is a no-op, unknown emails are NOT_FOUND
    assert.equal(ok(env.call(tok(OWNER), 'removeUser', { email: 'writer@gmail.com' })).active, false);
    err(env.call(tok(OWNER), 'removeUser', { email: 'nobody@gmail.com' }), 'NOT_FOUND');
  });

  test('adding a removed person again reactivates the same row', () => {
    const env = team();
    const first = ok(env.call(tok(OWNER), 'listUsers')).find(u => u.email === 'writer@gmail.com');
    ok(env.call(tok(OWNER), 'removeUser', { email: 'writer@gmail.com' }));
    const back = ok(env.call(tok(OWNER), 'saveUser', { email: 'writer@gmail.com', role: 'USER_RO' }));
    assert.equal(back.id, first.id);
    assert.equal(back.active, true);
    assert.equal(back.role, 'USER_RO');
    assert.equal(env.tab('Users').slice(1).length, 4);
  });

  test('the owner can never be demoted or removed, so there is always an admin', () => {
    const env = team();
    assert.match(err(env.call(tok('admin2@gmail.com'), 'saveUser', { email: OWNER, role: 'USER_RO' }), 'VALIDATION').message, /owner/);
    assert.match(err(env.call(tok('admin2@gmail.com'), 'removeUser', { email: OWNER.toUpperCase() }), 'VALIDATION').message, /owner/);
    assert.equal(ok(env.call(tok(OWNER), 'me')).role, 'ADMIN');
    // another admin may remove themselves; the owner remains
    ok(env.call(tok('admin2@gmail.com'), 'removeUser', { email: 'admin2@gmail.com' }));
    err(env.call(tok('admin2@gmail.com'), 'me'), 'FORBIDDEN');
  });

  test('listUsers puts the owner first, then active users, then removed ones', () => {
    const env = team();
    ok(env.call(tok(OWNER), 'removeUser', { email: 'admin2@gmail.com' }));
    const list = ok(env.call(tok(OWNER), 'listUsers'));
    assert.deepEqual(list.map(u => [u.email, u.active, u.isOwner]), [
      [OWNER, true, true],
      ['reader@gmail.com', true, false],
      ['writer@gmail.com', true, false],
      ['admin2@gmail.com', false, false]
    ]);
  });

  test('user input is validated', () => {
    const env = readyEnv();
    err(env.call(tok(OWNER), 'saveUser', { email: 'not-an-email', role: 'USER_W' }), 'VALIDATION');
    err(env.call(tok(OWNER), 'saveUser', { email: 'a@gmail.com', role: 'SUPERUSER' }), 'VALIDATION');
    err(env.call(tok(OWNER), 'saveUser', { email: 'a@gmail.com' }), 'VALIDATION');
    err(env.call(tok(OWNER), 'removeUser', {}), 'VALIDATION');
  });

  test('every user change is in the audit log with who made it', () => {
    const env = team();
    ok(env.call(tok(OWNER), 'saveUser', { email: 'writer@gmail.com', role: 'USER_RO' }));
    ok(env.call(tok('admin2@gmail.com'), 'removeUser', { email: 'reader@gmail.com' }));
    const log = env.tab('AuditLog').slice(1).map(r => ({ email: r[1], action: r[2], entity: r[3], changes: JSON.parse(r[5]) }));
    const users = log.filter(l => l.entity === 'Users');
    assert.equal(users.filter(l => l.action === 'create').length, 4);   // owner (setup) + 3
    const roleChange = users.find(l => l.action === 'update' && l.changes.role);
    assert.deepEqual(roleChange.changes.role, { old: 'USER_W', new: 'USER_RO' });
    assert.equal(roleChange.email, OWNER);
    const removal = users.find(l => l.changes.active);
    assert.equal(removal.email, 'admin2@gmail.com');
  });
});

describe('sheet storage', () => {
  // A test-only tab exercises the generic read/write layer with risky text and dates.
  function notesEnv(opts) {
    const env = makeEnv(opts);
    env.run(`TABS.Notes = { system: true, fields: { title: { type: 'string', max: 200 }, day: { type: 'date' } } };`);
    if (opts.runSetup) env.run('setup()');
    else {   // tabs typed in by hand: headers only, no plain-text formatting
      env.run(`
        for (const [name, def] of Object.entries(TABS)) {
          const s = SpreadsheetApp.getActive().insertSheet(name);
          const cols = columnsOf_(def);
          s.getRange(1, 1, 1, cols.length).setValues([cols]);
        }`);
    }
    return env;
  }
  const tricky = [
    '+91 98765 43210', '=HYPERLINK("http://evil")', '@mention', '-5 degrees', '2026-11-14',
    "'already quoted", "'=not a formula", '​starts with the marker', 'plain'
  ];

  for (const apostrophe of ['swallow', 'literal']) {
    for (const runSetup of [true, false]) {
      test(`text round-trips exactly (Sheets ${apostrophe}s apostrophes, setup ${runSetup ? 'run' : 'skipped'})`, () => {
        const env = notesEnv({ apostrophe, runSetup });
        env.run(`globalThis.actor = { email: 'a@gmail.com' }; globalThis.tricky = ${JSON.stringify(tricky)};`);
        env.run(`{ const t = readTable_('Notes'); for (const title of tricky) insertRecord_(t, { title, day: '2026-11-14' }, actor); }`);

        const back = env.run(`readTable_('Notes').rows.map(r => r.record)`);
        assert.deepEqual(back.map(r => r.title), tricky);
        assert.ok(back.every(r => r.day === '2026-11-14'));

        const all = env.ss.getSheets().flatMap(s => s.getDataRange().getValues().slice(1).flat());
        assert.ok(!all.includes('#FORMULA-EXECUTED#'), 'a formula was executed');
        assert.ok(!all.some(v => v instanceof Date), 'a value became a date cell');

        // repeated updates neither conflict nor pile up apostrophes
        env.run(`
          for (let i = 0; i < 3; i++) {
            const t = readTable_('Notes');
            updateRecord_(t, t.rows[0], { title: t.rows[0].record.title + '!' }, actor);
          }`);
        assert.equal(env.run(`readTable_('Notes').rows[0].record.title`), tricky[0] + '!!!');
      });
    }
  }

  test('an update with no changes writes nothing and logs nothing', () => {
    const env = notesEnv({ runSetup: true });
    env.run(`globalThis.actor = { email: 'a@gmail.com' }; { const t = readTable_('Notes'); insertRecord_(t, { title: 'x', day: null }, actor); }`);
    const before = env.tab('AuditLog').length;
    env.run(`{ const t = readTable_('Notes'); updateRecord_(t, t.rows[0], { title: 'x' }, actor); }`);
    assert.equal(env.tab('AuditLog').length, before);
  });
});
