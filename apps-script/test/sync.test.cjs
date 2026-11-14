// Checks that the frontend's copies of backend tables have not drifted from the backend.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeEnv } = require('./harness.cjs');

const ROOT = path.join(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** { action: [roles] } from a `NAME = { action: ['A', 'B'], ... }` object literal in source text. */
function parseRoleTable(source, name) {
  const start = source.indexOf(name);
  assert.ok(start >= 0, `${name} not found`);
  const body = source.slice(source.indexOf('{', start), source.indexOf('};', start));
  const table = {};
  for (const [, action, roles] of body.matchAll(/(\w+):\s*\[([^\]]*)\]/g)) {
    table[action] = [...roles.matchAll(/'(\w+)'/g)].map(m => m[1]).sort();
  }
  return table;
}

test('frontend PERMISSIONS match the server ACTIONS table', () => {
  const server = JSON.parse(makeEnv().run('JSON.stringify(ACTIONS)'));
  for (const k of Object.keys(server)) server[k].sort();
  const client = parseRoleTable(read('src/auth/permissions.ts'), 'PERMISSIONS: Record');
  assert.deepEqual(client, server);
});

test('the frontend Action type lists exactly the server actions', () => {
  const server = Object.keys(JSON.parse(makeEnv().run('JSON.stringify(ACTIONS)'))).sort();
  const types = read('src/api/types.ts');
  const union = types.slice(types.indexOf('export type Action ='), types.indexOf(';', types.indexOf('export type Action =')));
  const client = [...union.matchAll(/'(\w+)'/g)].map(m => m[1]).sort();
  assert.deepEqual(client, server);
});

test('server role list matches the frontend Role type', () => {
  const server = JSON.parse(makeEnv().run('JSON.stringify(ROLES)')).sort();
  const types = read('src/api/types.ts');
  const line = types.match(/export type Role = ([^;]+);/)[1];
  assert.deepEqual([...line.matchAll(/'(\w+)'/g)].map(m => m[1]).sort(), server);
});
