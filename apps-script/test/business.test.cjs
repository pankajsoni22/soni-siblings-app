// Partners, settings, transactions and reports, through the API as the browser calls it.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, tok, OWNER } = require('./harness.cjs');

const ok = res => { assert.equal(res.ok, true, JSON.stringify(res)); return res.data; };
const err = (res, code) => { assert.equal(res.ok, false, JSON.stringify(res)); assert.equal(res.error.code, code, JSON.stringify(res)); return res.error; };

const WRITER = 'writer@gmail.com';
const WRITER2 = 'writer2@gmail.com';
const READER = 'reader@gmail.com';

const todayIst = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const addDays = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

/** Owner, two writers, a reader, and partners A 40 / B 30 / C 30. */
function business() {
  const env = makeEnv({ maxRows: 8 });
  env.run('setup()');
  ok(env.call(tok(OWNER), 'saveUser', { email: WRITER, role: 'USER_W' }));
  ok(env.call(tok(OWNER), 'saveUser', { email: WRITER2, role: 'USER_W' }));
  ok(env.call(tok(OWNER), 'saveUser', { email: READER, role: 'USER_RO' }));
  const partners = ok(env.call(tok(OWNER), 'savePartners', { partners: [
    { name: 'Partner A', defaultSharePct: 40 },
    { name: 'Partner B', defaultSharePct: 30 },
    { name: 'Partner C', defaultSharePct: 30 }
  ] }));
  const [A, B, C] = partners;
  const shares = (a, b, c) => [{ partnerId: A.id, sharePct: a }, { partnerId: B.id, sharePct: b }, { partnerId: C.id, sharePct: c }];
  const txn = (over = {}) => ({ txnDate: '2026-05-10', customerName: 'Ramesh Kumar', amount: 500000, commissionRatePct: 0.3, ...over });
  const save = (who, payload) => env.call(tok(who), 'saveTransaction', payload);
  return { env, A, B, C, shares, txn, save };
}

function setCell(env, tab, id, column, value) {
  const rows = env.tab(tab);
  const col = rows[0].indexOf(column);
  const r = rows.findIndex(row => row[0] === id);
  env.ss.getSheetByName(tab).getRange(r + 1, col + 1).setValues([[value]]);
}

describe('partners and settings', () => {
  test('getConfig gives every role the default rate, active partners in order, and today', () => {
    const { env } = business();
    for (const who of [OWNER, WRITER, READER]) {
      const cfg = ok(env.call(tok(who), 'getConfig'));
      assert.equal(cfg.defaultCommissionRatePct, 0.3);
      assert.equal(cfg.rateWarningAbovePct, 2);
      assert.deepEqual(cfg.partners.map(p => [p.name, p.defaultSharePct]), [['Partner A', 40], ['Partner B', 30], ['Partner C', 30]]);
      assert.equal(cfg.today, todayIst());
    }
  });

  test('default shares of active partners must total exactly 100%', () => {
    const { env, A, B, C } = business();
    const list = (a, b, c, cActive = true) => ({ partners: [
      { id: A.id, name: A.name, defaultSharePct: a }, { id: B.id, name: B.name, defaultSharePct: b },
      { id: C.id, name: C.name, defaultSharePct: c, active: cActive }] });
    assert.match(err(env.call(tok(OWNER), 'savePartners', list(40, 30, 29.99)), 'VALIDATION').message, /99.99%/);
    err(env.call(tok(OWNER), 'savePartners', list(40, 30, 30.001)), 'VALIDATION');
    // deactivating C: A + B must now reach 100 on their own
    err(env.call(tok(OWNER), 'savePartners', list(40, 30, 30, false)), 'VALIDATION');
    const saved = ok(env.call(tok(OWNER), 'savePartners', list(50, 50, 30, false)));
    assert.deepEqual(saved.map(p => [p.name, p.active]), [['Partner A', true], ['Partner B', true], ['Partner C', false]]);
    assert.deepEqual(ok(env.call(tok(WRITER), 'getConfig')).partners.map(p => p.name), ['Partner A', 'Partner B']);
  });

  test('partners cannot be dropped, duplicated or all deactivated, and order follows the list', () => {
    const { env, A, B, C } = business();
    assert.match(err(env.call(tok(OWNER), 'savePartners', { partners: [
      { id: A.id, name: A.name, defaultSharePct: 50 }, { id: B.id, name: B.name, defaultSharePct: 50 }] }), 'VALIDATION').message, /Deactivate/);
    err(env.call(tok(OWNER), 'savePartners', { partners: [
      { id: A.id, name: A.name, defaultSharePct: 40 }, { id: B.id, name: 'partner a', defaultSharePct: 30 }, { id: C.id, name: C.name, defaultSharePct: 30 }] }), 'VALIDATION');
    err(env.call(tok(OWNER), 'savePartners', { partners: [
      { id: A.id, name: A.name, defaultSharePct: 100, active: false }, { id: B.id, name: B.name, defaultSharePct: 0, active: false },
      { id: C.id, name: C.name, defaultSharePct: 0, active: false }] }), 'VALIDATION');
    err(env.call(tok(OWNER), 'savePartners', { partners: [{ id: 'nope', name: 'X', defaultSharePct: 100 }] }), 'NOT_FOUND');
    const reordered = ok(env.call(tok(OWNER), 'savePartners', { partners: [
      { id: C.id, name: C.name, defaultSharePct: 30 }, { id: A.id, name: A.name, defaultSharePct: 40 },
      { id: B.id, name: B.name, defaultSharePct: 20 }, { name: 'Partner D', defaultSharePct: 10 }] }));
    assert.deepEqual(reordered.map(p => p.name), ['Partner C', 'Partner A', 'Partner B', 'Partner D']);
  });

  test('only admins manage partners and settings', () => {
    const { env } = business();
    for (const who of [WRITER, READER]) {
      err(env.call(tok(who), 'listPartners'), 'FORBIDDEN');
      err(env.call(tok(who), 'savePartners', { partners: [] }), 'FORBIDDEN');
      err(env.call(tok(who), 'saveSettings', { defaultCommissionRatePct: 0.5 }), 'FORBIDDEN');
    }
  });

  test('the default commission rate can be changed within limits', () => {
    const { env } = business();
    assert.equal(ok(env.call(tok(OWNER), 'saveSettings', { defaultCommissionRatePct: 0.275 })).defaultCommissionRatePct, 0.275);
    assert.equal(ok(env.call(tok(READER), 'getConfig')).defaultCommissionRatePct, 0.275);
    for (const bad of [0, 100, -1, 0.12345, 'abc', null]) err(env.call(tok(OWNER), 'saveSettings', { defaultCommissionRatePct: bad }), 'VALIDATION');
  });
});

describe('saving transactions', () => {
  test('the server calculates commission and earnings and ignores figures from the browser', () => {
    const { env, shares, txn, save } = business();
    const t = ok(save(WRITER, { transaction: txn({ commission: 999999, createdBy: 'evil@x.com', id: 'forged' }), shares: shares(40, 30, 30) }));
    assert.equal(t.commission, 1500);
    assert.deepEqual(t.shares.map(s => [s.partnerName, s.sharePct, s.earning]), [['Partner A', 40, 600], ['Partner B', 30, 450], ['Partner C', 30, 450]]);
    assert.equal(t.createdBy, WRITER);
    assert.notEqual(t.id, 'forged');
    assert.equal(t.repaidStatus, 'PENDING');
    assert.equal(env.tab('Shares').slice(1).length, 3);
  });

  test('shares come back in partner order whatever order they were sent in', () => {
    const { A, B, C, txn, save } = business();
    const t = ok(save(WRITER, { transaction: txn({ amount: 1000 }), shares: [
      { partnerId: C.id, sharePct: 0 }, { partnerId: A.id, sharePct: 60 }, { partnerId: B.id, sharePct: 40 }] }));
    assert.deepEqual(t.shares.map(s => [s.partnerName, s.earning]), [['Partner A', 1.8], ['Partner B', 1.2], ['Partner C', 0]]);
  });

  test('one audit entry per save, including the shares', () => {
    const { env, shares, txn, save } = business();
    const before = env.tab('AuditLog').length;
    const t = ok(save(WRITER, { transaction: txn(), shares: shares(40, 30, 30) }));
    const log = env.tab('AuditLog').slice(before);
    assert.equal(log.length, 1);
    assert.equal(log[0][2], 'create');
    assert.equal(log[0][4], t.id);
    assert.equal(JSON.parse(log[0][5]).new.shares.length, 3);
  });

  test('bad input is refused with a clear message', () => {
    const { A, B, C, shares, txn, save } = business();
    const tomorrow = addDays(todayIst(), 1);
    const cases = [
      [{ transaction: txn({ txnDate: tomorrow }), shares: shares(40, 30, 30) }, /future/],
      [{ transaction: txn({ txnDate: '2026-02-30' }), shares: shares(40, 30, 30) }, /txnDate/],
      [{ transaction: txn({ amount: 100.005 }), shares: shares(40, 30, 30) }, /2 decimal/],
      [{ transaction: txn({ amount: 0 }), shares: shares(40, 30, 30) }, /amount/],
      [{ transaction: txn({ amount: 1e10 }), shares: shares(40, 30, 30) }, /amount/],
      [{ transaction: txn({ commissionRatePct: 0 }), shares: shares(40, 30, 30) }, /more than 0/],
      [{ transaction: txn({ commissionRatePct: 100 }), shares: shares(40, 30, 30) }, /less than 100/],
      [{ transaction: txn({ commissionRatePct: 0.12345 }), shares: shares(40, 30, 30) }, /4 decimal/],
      [{ transaction: txn({ customerName: '   ' }), shares: shares(40, 30, 30) }, /customerName/],
      [{ transaction: txn({ repaidStatus: 'MAYBE' }), shares: shares(40, 30, 30) }, /repaidStatus/],
      [{ transaction: txn({ hacked: true }), shares: shares(40, 30, 30) }, /Unknown field/],
      [{ transaction: txn(), shares: shares(40, 30, 29) }, /99%/],
      [{ transaction: txn(), shares: shares(40, 30, 30.001) }, /2 decimal/],
      [{ transaction: txn(), shares: [] }, /at least one/],
      [{ transaction: txn(), shares: [{ partnerId: 'ghost', sharePct: 100 }] }, /Unknown partner/],
      [{ transaction: txn(), shares: [{ partnerId: A.id, sharePct: 50 }, { partnerId: A.id, sharePct: 50 }] }, /twice/],
      [{ transaction: 'nope', shares: shares(40, 30, 30) }, /transaction/],
      [{ id: 'missing', expectedUpdatedAt: 'x', transaction: txn(), shares: shares(40, 30, 30) }, /not found/i]
    ];
    for (const [payload, message] of cases) {
      const res = save(WRITER, payload);
      assert.equal(res.ok, false, JSON.stringify(payload));
      assert.match(res.error.message, message, JSON.stringify(payload));
    }
    void B; void C;
  });

  test('read-only users cannot change anything', () => {
    const { env, shares, txn, save } = business();
    const t = ok(save(WRITER, { transaction: txn(), shares: shares(40, 30, 30) }));
    err(save(READER, { transaction: txn(), shares: shares(40, 30, 30) }), 'FORBIDDEN');
    err(env.call(tok(READER), 'setRepaid', { id: t.id, repaidStatus: 'REPAID' }), 'FORBIDDEN');
    err(env.call(tok(READER), 'deleteTransaction', { id: t.id }), 'FORBIDDEN');
    err(env.call(tok(READER), 'restoreTransaction', { id: t.id }), 'FORBIDDEN');
  });
});

describe('editing transactions', () => {
  test('an edit recalculates, logs what changed, and detects conflicts', () => {
    const { env, shares, txn, save } = business();
    const t = ok(save(WRITER, { transaction: txn(), shares: shares(40, 30, 30) }));
    const before = env.tab('AuditLog').length;
    const edited = ok(save(WRITER2, { id: t.id, expectedUpdatedAt: t.updatedAt, transaction: txn({ amount: 600000 }), shares: shares(40, 30, 30) }));
    assert.equal(edited.commission, 1800);
    assert.deepEqual(edited.shares.map(s => s.earning), [720, 540, 540]);
    assert.equal(edited.updatedBy, WRITER2);
    assert.notEqual(edited.updatedAt, t.updatedAt);
    const log = env.tab('AuditLog').slice(before);
    assert.equal(log.length, 1);
    const changes = JSON.parse(log[0][5]);
    assert.deepEqual(changes.amount, { old: 500000, new: 600000 });
    assert.deepEqual(changes.commission, { old: 1500, new: 1800 });
    assert.ok(changes.shares);

    // the first writer's form is now stale
    assert.match(err(save(WRITER, { id: t.id, expectedUpdatedAt: t.updatedAt, transaction: txn({ notes: 'late' }), shares: shares(40, 30, 30) }), 'CONFLICT').message, /reloaded/);
    err(save(WRITER, { id: t.id, transaction: txn(), shares: shares(40, 30, 30) }), 'VALIDATION');
  });

  test('saving with no changes writes nothing and keeps updatedAt', () => {
    const { env, shares, txn, save } = business();
    const t = ok(save(WRITER, { transaction: txn(), shares: shares(40, 30, 30) }));
    const before = env.tab('AuditLog').length;
    const same = ok(save(WRITER, { id: t.id, expectedUpdatedAt: t.updatedAt, transaction: txn(), shares: shares(40, 30, 30) }));
    assert.equal(same.updatedAt, t.updatedAt);
    assert.equal(env.tab('AuditLog').length, before);
  });

  test('changing only the shares still bumps updatedAt; dropped partners lose their share row', () => {
    const { env, A, B, shares, txn, save } = business();
    const first = ok(save(WRITER, { transaction: txn(), shares: shares(40, 30, 30) }));
    const second = ok(save(WRITER, { id: first.id, expectedUpdatedAt: first.updatedAt, transaction: txn(), shares: [
      { partnerId: A.id, sharePct: 50 }, { partnerId: B.id, sharePct: 50 }] }));
    assert.notEqual(second.updatedAt, first.updatedAt);
    assert.deepEqual(second.shares.map(s => [s.partnerName, s.earning]), [['Partner A', 750], ['Partner B', 750]]);
    const listed = ok(env.call(tok(READER), 'listTransactions', { from: '2026-05-01', to: '2026-05-31' }));
    assert.equal(listed[0].shares.length, 2);
    const shareRows = env.tab('Shares');
    const deletedCol = shareRows[0].indexOf('deleted');
    assert.equal(shareRows.slice(1).filter(r => r[deletedCol] === 'TRUE').length, 1, 'C share row kept but marked deleted');
  });

  test('an inactive partner can stay on an old transaction but not be added to a new one', () => {
    const { env, A, B, C, shares, txn, save } = business();
    const old = ok(save(WRITER, { transaction: txn(), shares: shares(40, 30, 30) }));
    ok(env.call(tok(OWNER), 'savePartners', { partners: [
      { id: A.id, name: A.name, defaultSharePct: 50 }, { id: B.id, name: B.name, defaultSharePct: 50 },
      { id: C.id, name: C.name, defaultSharePct: 30, active: false }] }));
    const edited = ok(save(WRITER, { id: old.id, expectedUpdatedAt: old.updatedAt, transaction: txn({ notes: 'fixed spelling' }), shares: shares(40, 30, 30) }));
    assert.equal(edited.shares.length, 3);
    assert.match(err(save(WRITER, { transaction: txn(), shares: shares(40, 30, 30) }), 'VALIDATION').message, /inactive/);
  });

  test('getTransaction returns one entry with its shares, for every role; deleted ones are not found', () => {
    const { env, shares, txn, save } = business();
    const t = ok(save(WRITER, { transaction: txn(), shares: shares(40, 30, 30) }));
    const got = ok(env.call(tok(READER), 'getTransaction', { id: t.id }));
    assert.equal(got.updatedAt, t.updatedAt);
    assert.deepEqual(got.shares.map(s => s.earning), [600, 450, 450]);
    ok(env.call(tok(WRITER), 'deleteTransaction', { id: t.id }));
    err(env.call(tok(READER), 'getTransaction', { id: t.id }), 'NOT_FOUND');
    err(env.call(tok(READER), 'getTransaction', {}), 'VALIDATION');
  });

  test('getConfig lists the order of all partners, inactive ones included', () => {
    const { env, A, B, C } = business();
    ok(env.call(tok(OWNER), 'savePartners', { partners: [
      { id: C.id, name: C.name, defaultSharePct: 30, active: false }, { id: A.id, name: A.name, defaultSharePct: 50 },
      { id: B.id, name: B.name, defaultSharePct: 50 }] }));
    const cfg = ok(env.call(tok(WRITER), 'getConfig'));
    assert.deepEqual(cfg.partnerOrder, [C.id, A.id, B.id]);
    assert.deepEqual(cfg.partners.map(p => p.id), [A.id, B.id]);
  });

  test('mark repaid and back, audited', () => {
    const { env, shares, txn, save } = business();
    const t = ok(save(WRITER, { transaction: txn(), shares: shares(40, 30, 30) }));
    const repaid = ok(env.call(tok(WRITER2), 'setRepaid', { id: t.id, repaidStatus: 'REPAID' }));
    assert.equal(repaid.repaidStatus, 'REPAID');
    assert.equal(repaid.shares.length, 3);
    assert.equal(ok(env.call(tok(WRITER), 'setRepaid', { id: t.id, repaidStatus: 'PENDING' })).repaidStatus, 'PENDING');
    err(env.call(tok(WRITER), 'setRepaid', { id: t.id, repaidStatus: 'DONE' }), 'VALIDATION');
    const history = ok(env.call(tok(OWNER), 'getHistory', { id: t.id }));
    assert.deepEqual(history.map(h => h.action), ['update', 'update', 'create']);
    assert.deepEqual(history[1].changes.repaidStatus, { old: 'PENDING', new: 'REPAID' });
  });
});

describe('deleting and restoring', () => {
  test('a delete hides the transaction, keeps the row, and the deleter can undo it at once', () => {
    const { env, shares, txn, save } = business();
    const t = ok(save(WRITER, { transaction: txn(), shares: shares(40, 30, 30) }));
    const del = ok(env.call(tok(WRITER), 'deleteTransaction', { id: t.id }));
    assert.equal(del.deletedBy, WRITER);
    assert.equal(ok(env.call(tok(READER), 'listTransactions', { from: '2026-01-01', to: '2026-12-31' })).length, 0);
    err(env.call(tok(READER), 'listTransactions', { from: '2026-01-01', to: '2026-12-31', includeDeleted: true }), 'FORBIDDEN');
    const withDeleted = ok(env.call(tok(OWNER), 'listTransactions', { from: '2026-01-01', to: '2026-12-31', includeDeleted: true }));
    assert.equal(withDeleted.length, 1);
    assert.equal(withDeleted[0].deleted, true);
    err(save(WRITER, { id: t.id, expectedUpdatedAt: t.updatedAt, transaction: txn(), shares: shares(40, 30, 30) }), 'NOT_FOUND');
    // deleting twice is a no-op
    assert.equal(ok(env.call(tok(WRITER), 'deleteTransaction', { id: t.id })).deletedAt, del.deletedAt);

    const back = ok(env.call(tok(WRITER), 'restoreTransaction', { id: t.id }));
    assert.equal(back.deleted, false);
    assert.equal(back.shares.length, 3);
    assert.equal(ok(env.call(tok(READER), 'listTransactions', { from: '2026-01-01', to: '2026-12-31' })).length, 1);
  });

  test('after the undo window, or for someone else\'s delete, only an admin can restore', () => {
    const { env, shares, txn, save } = business();
    const t = ok(save(WRITER, { transaction: txn(), shares: shares(40, 30, 30) }));
    ok(env.call(tok(WRITER), 'deleteTransaction', { id: t.id }));
    err(env.call(tok(WRITER2), 'restoreTransaction', { id: t.id }), 'FORBIDDEN');
    setCell(env, 'Transactions', t.id, 'deletedAt', new Date(Date.now() - 60_000).toISOString());
    err(env.call(tok(WRITER), 'restoreTransaction', { id: t.id }), 'FORBIDDEN');
    assert.equal(ok(env.call(tok(OWNER), 'restoreTransaction', { id: t.id })).deleted, false);
  });

  test('the full history is admin only and lists every step, newest first', () => {
    const { env, shares, txn, save } = business();
    const t = ok(save(WRITER, { transaction: txn(), shares: shares(40, 30, 30) }));
    ok(save(WRITER, { id: t.id, expectedUpdatedAt: t.updatedAt, transaction: txn({ customerName: 'Ramesh K.' }), shares: shares(40, 30, 30) }));
    ok(env.call(tok(WRITER), 'deleteTransaction', { id: t.id }));
    ok(env.call(tok(OWNER), 'restoreTransaction', { id: t.id }));
    err(env.call(tok(WRITER), 'getHistory', { id: t.id }), 'FORBIDDEN');
    const history = ok(env.call(tok(OWNER), 'getHistory', { id: t.id }));
    assert.deepEqual(history.map(h => [h.action, h.email]), [['restore', OWNER], ['delete', WRITER], ['update', WRITER], ['create', WRITER]]);
    assert.deepEqual(history[2].changes.customerName, { old: 'Ramesh Kumar', new: 'Ramesh K.' });
    err(env.call(tok(OWNER), 'getHistory', { id: 'nope' }), 'NOT_FOUND');
  });
});

describe('listing and reports', () => {
  function seeded() {
    const b = business();
    const add = (date, amount, rate, s, status) => {
      const t = ok(b.save(WRITER, { transaction: b.txn({ txnDate: date, amount, commissionRatePct: rate, repaidStatus: status }), shares: s }));
      return t;
    };
    const t1 = add('2026-04-02', 500000, 0.3, b.shares(40, 30, 30), 'REPAID');    // 1500
    const t2 = add('2026-04-20', 100000, 0.3, b.shares(33.33, 33.33, 33.34), 'PENDING');   // 300
    add('2026-06-15', 200000, 0.275, b.shares(40, 30, 30), 'PENDING');            // 550
    const gone = add('2026-06-16', 999999, 0.3, b.shares(40, 30, 30), 'PENDING');
    ok(b.env.call(tok(OWNER), 'deleteTransaction', { id: gone.id }));
    add('2026-07-01', 1000, 0.3, b.shares(40, 30, 30), 'PENDING');                // outside Q1
    // C leaves after April; A and B split from then on
    ok(b.env.call(tok(OWNER), 'savePartners', { partners: [
      { id: b.A.id, name: 'Partner A', defaultSharePct: 50 }, { id: b.B.id, name: 'Partner B', defaultSharePct: 50 },
      { id: b.C.id, name: 'Partner C', defaultSharePct: 30, active: false }] }));
    return { ...b, t1, t2 };
  }

  test('listTransactions filters by date inclusively, newest first, with shares', () => {
    const { env } = seeded();
    const list = ok(env.call(tok(READER), 'listTransactions', { from: '2026-04-02', to: '2026-06-15' }));
    assert.deepEqual(list.map(t => t.txnDate), ['2026-06-15', '2026-04-20', '2026-04-02']);
    assert.ok(list.every(t => t.shares.length === 3));
    err(env.call(tok(READER), 'listTransactions', { from: '2026-06-01', to: '2026-04-01' }), 'VALIDATION');
    err(env.call(tok(READER), 'listTransactions', { from: '2026-04-01' }), 'VALIDATION');
  });

  test('report totals Q1 FY 2026-27 (Apr–Jun) for every role', () => {
    const { env, A, B, C } = seeded();
    for (const who of [OWNER, WRITER, READER]) {
      const r = ok(env.call(tok(who), 'report', { from: '2026-04-01', to: '2026-06-30' }));
      assert.deepEqual(r.totals, {
        lent: 800000, commission: 2350, count: 3, averageRatePct: 0.2938,
        pendingAmount: 300000, pendingCount: 2
      });
      assert.deepEqual(r.byMonth, [
        { month: '2026-04', lent: 600000, commission: 1800, count: 2 },
        { month: '2026-05', lent: 0, commission: 0, count: 0 },
        { month: '2026-06', lent: 200000, commission: 550, count: 1 }
      ]);
      // A: 600 + 99.99 + 220 · B: 450 + 99.99 + 165 · C (inactive now): 450 + 100.02 + 165
      assert.deepEqual(r.byPartner.map(p => [p.partnerId, p.partnerName, p.active, p.earning]), [
        [A.id, 'Partner A', true, 919.99],
        [B.id, 'Partner B', true, 714.99],
        [C.id, 'Partner C', false, 715.02]
      ]);
      const sum = r.byPartner.reduce((t, p) => t + Math.round(p.earning * 100), 0);
      assert.equal(sum, 235000, 'partner earnings add up to the total commission');
    }
  });

  test('an empty period reports zeros, active partners at zero, and no average rate', () => {
    const { env } = seeded();
    const r = ok(env.call(tok(READER), 'report', { from: '2025-01-01', to: '2025-01-31' }));
    assert.deepEqual(r.totals, { lent: 0, commission: 0, count: 0, averageRatePct: null, pendingAmount: 0, pendingCount: 0 });
    assert.deepEqual(r.byPartner.map(p => [p.partnerName, p.earning]), [['Partner A', 0], ['Partner B', 0]]);
    err(env.call(tok(READER), 'report', { from: '2000-01-01', to: '2026-01-01' }), 'VALIDATION');
  });
});

describe('sync', () => {
  test('a first sync sends everything live; later syncs send only changes and deleted ids', () => {
    const { env, shares, txn, save } = business();
    const t1 = ok(save(WRITER, { transaction: txn(), shares: shares(40, 30, 30) }));
    const t2 = ok(save(WRITER, { transaction: txn({ customerName: 'Anita' }), shares: shares(40, 30, 30) }));
    ok(env.call(tok(WRITER), 'deleteTransaction', { id: t2.id }));

    const first = ok(env.call(tok(READER), 'sync', {}));
    assert.equal(first.full, true);
    assert.deepEqual(first.transactions.map(t => t.id), [t1.id]);
    assert.equal(first.transactions[0].shares.length, 3);
    assert.deepEqual(first.removed, []);
    assert.equal(first.user.role, 'USER_RO');
    assert.equal(first.config.partners.length, 3);
    assert.deepEqual(first.partners.map(p => p.name), ['Partner A', 'Partner B', 'Partner C']);
    assert.ok(first.cursor >= t1.updatedAt);

    // Nothing more than the overlap window resends; move the cursor past it to check filtering.
    const later = new Date(Date.parse(first.cursor) + 10 * 60 * 1000).toISOString();
    const none = ok(env.call(tok(READER), 'sync', { since: later }));
    assert.equal(none.full, false);
    assert.deepEqual([none.transactions, none.removed], [[], []]);
    assert.equal(none.cursor, later);

    const incremental = ok(env.call(tok(READER), 'sync', { since: first.cursor }));
    assert.equal(incremental.full, false);
    assert.ok(incremental.removed.includes(t2.id));
    assert.ok(!incremental.transactions.some(t => t.id === t2.id));
    assert.ok(!('customerName' in incremental), 'deleted rows are sent as ids only');
  });

  test('changes after the cursor arrive, including a restore', () => {
    const { env, shares, txn, save } = business();
    const t1 = ok(save(WRITER, { transaction: txn(), shares: shares(40, 30, 30) }));
    ok(env.call(tok(WRITER), 'deleteTransaction', { id: t1.id }));
    const s = ok(env.call(tok(READER), 'sync', {}));
    assert.deepEqual(s.transactions, []);
    ok(env.call(tok(OWNER), 'restoreTransaction', { id: t1.id }));
    const next = ok(env.call(tok(READER), 'sync', { since: s.cursor }));
    assert.deepEqual(next.transactions.map(t => t.id), [t1.id]);
    assert.ok(next.cursor > s.cursor);
  });

  test('a removed user cannot sync', () => {
    const { env } = business();
    ok(env.call(tok(OWNER), 'removeUser', { email: READER }));
    err(env.call(tok(READER), 'sync', {}), 'FORBIDDEN');
  });
});
