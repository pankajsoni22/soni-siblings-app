// Smoke test of the deployed Apps Script backend: checks it answers, and that it refuses
// requests without a valid Google sign-in. Uses no credentials and changes nothing.
//
//   npm run smoke:backend                 # reads VITE_API_URL from .env
//   npm run smoke:backend -- <exec URL>
import fs from 'node:fs';

const fromEnv = () => {
  try {
    return fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').match(/^VITE_API_URL=(.+)$/m)?.[1]?.trim();
  } catch {
    return undefined;
  }
};
const url = process.argv[2] ?? fromEnv();
if (!url || url.includes('XXXX') || !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) {
  console.error('Set VITE_API_URL in .env to the web app URL (https://script.google.com/macros/s/…/exec), or pass it as an argument.');
  process.exit(2);
}

let failures = 0;
async function check(name, run, expect) {
  try {
    const res = await run();
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = null; }
    const problem = body ? expect(body) : 'answer is not JSON (deployment access may not be "Anyone": Google sent a login page)';
    if (problem) { failures++; console.log(`✖ ${name}: ${problem}\n   got: ${text.slice(0, 200)}`); }
    else console.log(`✔ ${name}`);
  } catch (err) {
    failures++;
    console.log(`✖ ${name}: ${err.message}`);
  }
}

const post = body => fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body, redirect: 'follow' });
const refused = code => b => (b.ok === false && b.error?.code === code ? null : `expected ${code}`);

await check('GET answers "API is running"', () => fetch(url, { redirect: 'follow' }),
  b => (b.ok === true && b.data === 'API is running' ? null : 'unexpected answer'));
await check('no token is refused (AUTH_REQUIRED)', () => post('{}'), refused('AUTH_REQUIRED'));
await check('a made-up token is refused (AUTH_REQUIRED)', () => post(JSON.stringify({ action: 'listTransactions', token: 'not-a-real-token', payload: {} })), refused('AUTH_REQUIRED'));
await check('a write without a token is refused (AUTH_REQUIRED)', () => post(JSON.stringify({ action: 'saveTransaction', payload: {} })), refused('AUTH_REQUIRED'));
await check('a body that is not JSON is rejected (VALIDATION)', () => post('hello'), refused('VALIDATION'));
await check('errors reveal no internals', () => post('{}'), b => (/at |Error:|\.gs/.test(b.error?.message ?? '') ? 'error message looks like a stack trace' : null));

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
