// Writes .clasp.json from SCRIPT_ID in .env, so the Script ID lives in one place.
// Used by `npm run push:backend`.
import fs from 'node:fs';

const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
const scriptId = env.match(/^SCRIPT_ID=(.+)$/m)?.[1]?.trim();
if (!scriptId) {
  console.error('SCRIPT_ID is missing from .env (Apps Script → Project Settings → IDs).');
  process.exit(1);
}
const config = { scriptId, rootDir: 'apps-script' };
fs.writeFileSync(new URL('../.clasp.json', import.meta.url), JSON.stringify(config, null, 2) + '\n');
