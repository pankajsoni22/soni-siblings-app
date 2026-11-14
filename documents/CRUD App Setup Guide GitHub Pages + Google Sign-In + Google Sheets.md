# CRUD App Setup Guide: GitHub Pages + Google Sign-In + Google Sheets

Nov 14, 2026 · @Pankaj Soni

## Overview

The app is a static single-page site on GitHub Pages. Users sign in with Google, and every request carries their Google ID token to an Apps Script web app bound to one Google Sheet. The script verifies the token and checks the email against an allow-list before it reads or writes anything. All parts are free.

Access is restricted by three independent gates:

1. **Google sign-in gate:** the OAuth app stays in *Testing* status, so only emails listed as test users can complete Google sign-in.
2. **Token gate:** the script rejects any token that is missing, expired, forged, or issued for a different client ID.
3. **Allow-list gate:** the script rejects any verified email that is not in `ALLOWED_EMAILS` (stored in Script Properties, not in the repo). This is the authoritative check.

| Component | Hosted on | Role | Public? |
| --- | --- | --- | --- |
| Frontend (HTML/CSS/JS) | GitHub Pages, public repo | UI, Google sign-in button, calls the API | Yes, code is readable by anyone |
| OAuth client ID | Google Cloud Console | Identifies the app to Google sign-in | Yes, safe to put in code |
| Backend (Apps Script web app) | Google, bound to the Sheet | Verifies users, validates input, does CRUD | URL is public, but useless without a valid token |
| Database (Google Sheet) | Owner's Google Drive | Stores records, audit log | No, shared with nobody |
| Secrets (allow-list, config) | Apps Script Script Properties | Who may use the app | No |

Request flow:

1. User opens `https://<username>.github.io/<repo>/` and clicks **Sign in with Google**.
2. Google Identity Services returns a signed ID token (JWT, valid about 1 hour) to the page.
3. The page sends `POST {action, token, payload}` to the Apps Script `/exec` URL.
4. The script verifies the token with Google, checks the audience, expiry and allow-list.
5. If allowed, the script performs the action on the Sheet under a lock and writes an audit entry.
6. The script returns `{ok, data}` or `{ok:false, error}` as JSON; the page renders it.

## Prerequisites and values to collect

You need one Google account (the owner, which holds the Sheet and the script), one GitHub account, and the list of people allowed in. No billing account and no paid plan are needed.

- Turn on 2-Step Verification for both the Google and GitHub owner accounts. Whoever controls them controls the app.
- Each allowed person needs a Google account (Gmail or Google Workspace). Testing mode allows up to 100 test users.

Fill this table as you go through the steps. Implementation needs every value.

| Name | Example | Comes from | Where it is used | Secret? |
| --- | --- | --- | --- | --- |
| `GITHUB_USERNAME` | `pankajsoni` | Your GitHub account | Pages URL | No |
| `REPO_NAME` | `team-tracker` | Step 1 | Pages URL | No |
| `PAGES_ORIGIN` | `https://pankajsoni.github.io` | Step 1 | OAuth client, JavaScript origins | No |
| `PAGES_URL` | `https://pankajsoni.github.io/team-tracker/` | Step 1 | Link you share with users | No |
| `GOOGLE_CLIENT_ID` | `1234-abc.apps.googleusercontent.com` | Step 2 | `js/config.js` and Script Properties | No |
| Client secret | `GOCSPX-…` | Step 2 (shown once) | Not used. Never commit it | Yes |
| Spreadsheet | `Team Tracker DB` | Step 3 | Bound to the script | Contents private |
| `API_URL` | `https://script.google.com/macros/s/…/exec` | Step 5 | `js/config.js` | No |
| `ALLOWED_EMAILS` | `a@gmail.com,b@gmail.com` | You | Script Properties + test users | Keep private |

## Step 1: Create the public GitHub repo and turn on Pages

The repo must be public: GitHub Pages is free only for public repositories on a GitHub Free account. Everything in it is readable by anyone, so it must never hold secrets.

### 1.1 Create the repository

1. Sign in at github.com, click **+** (top right), then **New repository**.
2. **Owner:** your account. **Repository name:** lowercase with hyphens, for example `team-tracker`. It becomes part of the URL.
3. **Visibility:** Public.
4. Tick **Add a README file**. Leave .gitignore as None. A licence is optional.
5. Click **Create repository**.

### 1.2 Add a placeholder page

1. In the repo, click **Add file → Create new file**.
2. Name it `index.html` and paste `<!doctype html><h1>Coming soon</h1>`.
3. Click **Commit changes…**, keep “Commit directly to the main branch”, then confirm.
4. Create an empty file named `.nojekyll` the same way. It stops GitHub from running Jekyll, which would hide files and folders starting with `_`.

### 1.3 Turn on GitHub Pages

1. Open the repo's **Settings**, then **Pages** (left sidebar, under *Code and automation*).
2. Under **Build and deployment**, set **Source** to *Deploy from a branch*.
3. Set **Branch** to `main` and the folder to `/ (root)`, then click **Save**.
4. Wait 1–10 minutes. Refresh the page until it shows *Your site is live at* `https://<username>.github.io/<repo>/`. The **Actions** tab shows the “pages build and deployment” run.
5. Confirm **Enforce HTTPS** is ticked (on by default for github.io).
6. Write down `PAGES_URL` (the full link) and `PAGES_ORIGIN` (only `https://<username>.github.io`, no path, no trailing slash). Google needs the origin in Step 2.

### 1.4 Planned repo layout

```
/
├── index.html            # single page, app shell
├── .nojekyll
├── README.md
├── css/styles.css
├── js/config.js          # GOOGLE_CLIENT_ID, API_URL (both public)
├── js/auth.js            # Google sign-in, token handling
├── js/api.js             # fetch wrapper for the Apps Script API
├── js/app.js             # views, forms, CRUD logic
└── apps-script/          # copy of the backend for version history (not executed here)
    ├── Code.gs
    └── appsscript.json
```

### 1.5 Optional: work locally

```bash
git clone https://github.com/<username>/<repo>.git
cd <repo>
# edit files
git add .
git commit -m "Add app shell"
git push origin main   # Pages redeploys in about a minute
```

## Step 2: Google Cloud project and OAuth client ID

This step produces `GOOGLE_CLIENT_ID` and makes only your listed people able to sign in. No APIs need enabling and no billing is required. Google moved these screens from *APIs & Services → OAuth consent screen / Credentials* into **Google Auth Platform**, split into Branding, Audience, Data Access and Clients. Older tutorials use the old names.

### 2.1 Create a project

1. Open console.cloud.google.com with the owner Google account.
2. Click the project picker (top bar), then **New project**.
3. Name it, for example `team-tracker`. Leave Organization as “No organization” for a personal account. Click **Create**, then select the new project.

### 2.2 Register the app with Google Auth Platform

1. Open the navigation menu, then **Google Auth Platform** (or search for it). Click **Get started**.
2. **App information:** App name (users see it on the Google sign-in prompt) and User support email.
3. **Audience:** choose **External**. *Internal* is only available inside a Google Workspace organization.
4. **Contact information:** your email. Accept the policy, then click **Create**.
5. **Branding:** do not upload a logo. A logo triggers Google's brand verification. App domain fields can stay empty.
6. **Data Access:** add nothing. Sign-in uses only `openid`, `email` and `profile`, which are non-sensitive and need no verification.

### 2.3 Keep it in Testing and add test users

1. Open **Audience**. Leave **Publishing status** as **Testing**. Do not click *Publish app*.
2. Under **Test users**, click **Add users** and enter each allowed email, including your own. The limit is 100.
3. Save. In Testing status only these accounts can complete Google sign-in; everyone else gets an “access blocked” error. Treat this as a first gate: the script's allow-list (Step 4) is the authoritative check.

### 2.4 Create the OAuth client ID

1. Open **Clients**, then **Create client**.
2. **Application type:** Web application. **Name:** `GitHub Pages client`.
3. **Authorized JavaScript origins:** click **Add URI** for each of these:
   - `https://<username>.github.io` (your `PAGES_ORIGIN`: HTTPS, no path, no trailing slash, no wildcards)
   - `http://localhost` and `http://localhost:8000` for local testing. Google Sign-In needs both the bare and the port entry
4. **Authorized redirect URIs:** leave empty. The sign-in button uses a popup and callback, not redirects.
5. Click **Create**. Copy the **Client ID** (ends in `.apps.googleusercontent.com`) into your values table.
6. A client secret is also shown. This app does not use it. Do not put it in the repo or the script.
7. New or changed origins can take from 5 minutes to a few hours to work. An `origin_mismatch` error right after creation usually just means waiting.

Note: every repo under the same GitHub account shares the origin `https://<username>.github.io`. A different repo of yours could therefore also request tokens for this client ID. That is harmless, because the script still requires an allowed email; it is mentioned here so no one relies on the origin alone.

## Step 3: Set up the Google Sheet

The Sheet is the database: one tab per entity (record type), one row per record, row 1 holds the column headers. It stays in the owner's Drive and is shared with no one; users reach the data only through the app.

1. In Google Drive (owner account), create a new Google Sheet. Name it, for example `Team Tracker DB`.
2. Create one tab per entity from the functional spec (for example `Items`), plus an `AuditLog` tab.
3. In each entity tab, type the headers in row 1 and freeze it (**View → Freeze → 1 row**).
4. Do not share the Sheet. App users never need access to it.

Every entity tab starts with these system columns, written only by the script. The business fields from the functional spec follow them.

| Column | Type | Set by | Purpose |
| --- | --- | --- | --- |
| `id` | UUID text | Script on create | Stable record key; never reused |
| `createdAt` | ISO 8601 text | Script | When the row was added |
| `createdBy` | email | Script, from the verified token | Who added it |
| `updatedAt` | ISO 8601 text | Script on every change | Also used to detect edit conflicts |
| `updatedBy` | email | Script | Who changed it last |
| `deleted` | TRUE/FALSE | Script | Soft delete flag; deleted rows are hidden, not removed |
| `deletedAt` | ISO 8601 text | Script | When it was deleted |
| `deletedBy` | email | Script | Who deleted it |

`AuditLog` columns: `timestamp`, `email`, `action` (create, update, delete, restore), `entity`, `recordId`, `changes` (JSON of old and new values).

Conventions the code relies on:

- The script finds columns by header name, so columns may be reordered. Renaming a header breaks the code until the field map is updated.
- Dates are stored as ISO 8601 text (`2026-11-14T08:30:00.000Z`), not Sheet date cells, so the timezone never shifts them.
- To restore a deleted record by hand, set its `deleted` cell back to `FALSE`.
- This setup is sized for a few people and up to a few thousand rows per tab. Each request takes roughly 1–3 seconds. Heavy traffic or large datasets need a real database.

## Step 4: Build the Apps Script backend

The script is bound to the Sheet, can touch only that one spreadsheet, and trusts nothing from the browser except a Google-signed token. Open it from the Sheet with **Extensions → Apps Script** and rename the project (for example `team-tracker-api`).

### 4.1 Lock down scopes with the manifest

1. In the script editor, open **Project Settings** (gear icon) and tick **Show "appsscript.json" manifest file in editor**.
2. Replace `appsscript.json` with:

```json
{
  "timeZone": "Asia/Kolkata",
  "runtimeVersion": "V8",
  "exceptionLogging": "STACKDRIVER",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets.currentonly",
    "https://www.googleapis.com/auth/script.external_request"
  ],
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
}
```

- `spreadsheets.currentonly` limits the script to the Sheet it is bound to. It cannot see Drive, Gmail or other files.
- `script.external_request` lets it call Google's token-verification endpoint.
- Listing scopes explicitly stops Apps Script from adding broader ones automatically. Any new service used later (for example time triggers created in code) needs its scope added here.

### 4.2 Store configuration in Script Properties

Open **Project Settings → Script Properties → Add script property**:

| Property | Value | Notes |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | the client ID from Step 2 | Must match exactly |
| `ALLOWED_EMAILS` | `a@gmail.com,b@gmail.com` | Lowercase, comma-separated |
| `ADMIN_EMAILS` | `you@gmail.com` | Optional, only if the spec has roles |

These values live with the script, not in GitHub, and changes apply on the next request without redeploying.

### 4.3 Verify every request

Each request is checked against Google's `tokeninfo` endpoint. The verified token is cached for at most 5 minutes to keep requests fast. The allow-list is checked on every request, so removing someone takes effect immediately.

```javascript
class ApiError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function verifyUser_(idToken) {
  if (!idToken) throw new ApiError('AUTH_REQUIRED', 'Sign in required');
  const props = PropertiesService.getScriptProperties();
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
    if (info.aud !== props.getProperty('GOOGLE_CLIENT_ID')) throw new ApiError('AUTH_REQUIRED', 'Wrong audience');
    if (!['accounts.google.com', 'https://accounts.google.com'].includes(info.iss)) throw new ApiError('AUTH_REQUIRED', 'Wrong issuer');
    if (String(info.email_verified) !== 'true') throw new ApiError('AUTH_REQUIRED', 'Email not verified');
    const ttl = Math.min(300, Number(info.exp) - Math.floor(Date.now() / 1000));
    if (ttl > 0) cache.put(key, JSON.stringify(info), ttl);
  }
  if (Number(info.exp) * 1000 < Date.now()) throw new ApiError('AUTH_REQUIRED', 'Token expired');

  const email = String(info.email).toLowerCase();
  const list = p => (props.getProperty(p) || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!list('ALLOWED_EMAILS').includes(email)) throw new ApiError('FORBIDDEN', 'Not allowed');
  return { email, name: info.name || email, isAdmin: list('ADMIN_EMAILS').includes(email) };
}
```

### 4.4 API contract

Every call is `POST` to the `/exec` URL with a JSON body sent as `text/plain`. The token goes in the body, never in the URL, so it does not end up in logs or history. Apps Script always returns HTTP 200, so the client checks `ok`.

| Action | Payload | Returns |
| --- | --- | --- |
| `me` | none | `{email, name, isAdmin}` |
| `list` | `{entity, includeDeleted?}` | array of records (deleted hidden by default) |
| `get` | `{entity, id}` | one record |
| `create` | `{entity, data}` | the created record with system fields |
| `update` | `{entity, id, data, expectedUpdatedAt}` | the updated record; `CONFLICT` if someone changed it first |
| `delete` | `{entity, id}` | `{id}`; soft delete only |
| `restore` | `{entity, id}` | the restored record (admin only, if roles exist) |

Response shape: `{"ok": true, "data": …}` or `{"ok": false, "error": {"code": "…", "message": "…"}}`. Error codes: `AUTH_REQUIRED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION`, `CONFLICT`, `SERVER`.

### 4.5 Entry point and write rules

```javascript
// Filled in from the functional spec: the only entities and fields the API accepts.
const ENTITIES = {
  Items: {
    sheet: 'Items',
    fields: {
      title:  { type: 'string', required: true, max: 200 },
      status: { type: 'enum', values: ['Open', 'Done'], required: true }
    }
  }
};

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    const user = verifyUser_(req.token);
    return json_({ ok: true, data: route_(req.action, req.payload || {}, user) });
  } catch (err) {
    const code = err.code || 'SERVER';
    if (code === 'SERVER') console.error(err.stack);
    return json_({ ok: false, error: { code, message: code === 'SERVER' ? 'Server error' : err.message } });
  }
}

function doGet() { return json_({ ok: true, data: 'API is running' }); }

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);              // waits up to 10 s, then throws
  try { return fn(); } finally { lock.releaseLock(); }
}
```

Rules every handler follows:

- **Allow-list fields.** Accept only fields listed in `ENTITIES`. Reject unknown entities and fields, and check type, required, length and enum values. Return `VALIDATION` with the field name.
- **Server owns system fields.** Ignore any `id`, `createdBy`, `updatedAt` or `deleted` sent by the browser. Set them from the verified user and `Utilities.getUuid()`.
- **Stop formula injection.** Prefix any text starting with `=`, `+`, `-` or `@` with an apostrophe (`'`) before writing, so the Sheet stores it as text.
- **Lock every write.** Wrap create, update, delete and restore in `withLock_` so two users never write over each other.
- **Detect conflicts.** On update, compare `expectedUpdatedAt` with the row's `updatedAt`. If they differ, return `CONFLICT` so the UI can reload the record.
- **Soft delete only.** Set `deleted`, `deletedAt`, `deletedBy`. Never call `deleteRow`.
- **Audit everything.** Append one `AuditLog` row per write, with old and new values.
- **Read efficiently.** Read a tab once with `getDataRange().getValues()`, then map rows by header. Never read cell by cell.

## Step 5: Deploy the script as a web app

Deploy as **Execute as: Me** and **Who has access: Anyone**. Then write down the `/exec` URL: it is the `API_URL`, and it stays the same for every later version.

### 5.1 Authorize once

1. Save all files. Select any function in the editor toolbar (for example a small `setup_` function that writes the headers) and click **Run**.
2. Click **Review permissions** and choose the owner account.
3. Google shows “Google hasn't verified this app” because it is your own script. Click **Advanced → Go to \<project> (unsafe) → Allow**.
4. Check the consent list. It should ask only to view and manage spreadsheets this app is installed in, and to connect to an external service. Anything broader means the manifest scopes are wrong.

### 5.2 Create the deployment

1. Click **Deploy → New deployment**, then the gear icon next to *Select type* and choose **Web app**.
2. **Description:** `v1`.
3. **Execute as:** Me (owner). The script uses the owner's access to the Sheet, so users never need Sheet access.
4. **Who has access:** Anyone. The browser cannot send Google login cookies from GitHub Pages to Apps Script, so login is enforced in code with the ID token instead. Anyone can reach the URL, but every request without a valid token from an allowed email is rejected.
5. Click **Deploy** and copy the **Web app URL** (ends in `/exec`) into `API_URL`.
6. Test it: open the URL in a browser. It should show `{"ok":true,"data":"API is running"}`.

### 5.3 Ship backend changes without changing the URL

1. Edit and save the code.
2. Click **Deploy → Manage deployments**, select the deployment, click the pencil icon.
3. Set **Version** to *New version*, add a description, click **Deploy**.

Do not use **New deployment** for updates: it creates a new URL and the frontend would keep calling the old version. The `/dev` test URL works only for the owner while signed in, so the frontend never uses it.

## Step 6: Wire up the frontend

The page loads Google Identity Services, keeps the ID token in memory, and sends it with every API call. Hiding the UI before sign-in is only for appearance; the backend checks are what protect the data.

### 6.1 Config (public values only)

```javascript
// js/config.js
window.APP_CONFIG = {
  GOOGLE_CLIENT_ID: 'XXXX.apps.googleusercontent.com',
  API_URL: 'https://script.google.com/macros/s/XXXX/exec'
};
```

### 6.2 Page shell

```html
<!-- index.html (excerpt) -->
<script src="https://accounts.google.com/gsi/client" async defer></script>
<script src="js/config.js?v=1"></script>
<script src="js/auth.js?v=1"></script>
<script src="js/api.js?v=1"></script>
<script src="js/app.js?v=1"></script>

<div id="signin-view"><div id="signin-button"></div></div>
<div id="app-view" hidden><!-- CRUD UI --></div>
```

Bump `?v=` on each release so browsers fetch the new files instead of cached ones.

### 6.3 Sign-in

```javascript
// js/auth.js
let idToken = null;
let tokenExp = 0;

function decodeJwt(token) {
  const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));   // for display only; the server verifies
}

function initAuth(onSignedIn) {
  google.accounts.id.initialize({
    client_id: APP_CONFIG.GOOGLE_CLIENT_ID,
    auto_select: true,               // silent sign-in for returning users
    cancel_on_tap_outside: false,
    callback: ({ credential }) => {
      idToken = credential;
      const p = decodeJwt(credential);
      tokenExp = p.exp * 1000;
      onSignedIn({ email: p.email, name: p.name, picture: p.picture });
    }
  });
  google.accounts.id.renderButton(document.getElementById('signin-button'),
    { theme: 'filled_black', size: 'large', text: 'signin_with' });
  google.accounts.id.prompt();       // One Tap, if available
}

function signOut() {
  idToken = null;
  google.accounts.id.disableAutoSelect();
  location.reload();
}

window.addEventListener('load', () => initAuth(user => app.start(user)));
```

### 6.4 API client

```javascript
// js/api.js
async function api(action, payload = {}) {
  if (!idToken || Date.now() > tokenExp - 60_000) {
    google.accounts.id.prompt();                 // get a fresh token (about 1 hour lifetime)
    throw Object.assign(new Error('Session expired, please sign in again'), { code: 'AUTH_REQUIRED' });
  }
  const res = await fetch(APP_CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // avoids a CORS preflight
    body: JSON.stringify({ action, token: idToken, payload }),
    redirect: 'follow'
  });
  const json = await res.json();
  if (!json.ok) throw Object.assign(new Error(json.error.message), { code: json.error.code });
  return json.data;
}
```

### 6.5 UI rules

- Keep the `text/plain` content type. `application/json` triggers a CORS preflight that Apps Script cannot answer, so the request fails.
- Render data with `textContent` or `createElement`, never `innerHTML` with record values, to prevent script injection from stored text.
- On `AUTH_REQUIRED`, show the sign-in view. On `FORBIDDEN`, show “Your account doesn't have access” and a sign-out button.
- On `CONFLICT`, reload the record and tell the user someone else changed it.
- Show a loading state and disable the submit button during calls; each takes about 1–3 seconds.
- Ask for confirmation before delete, and offer Undo (calls `restore`) where the spec allows.

### 6.6 Option: React + Vite frontend

The backend, Sheet, OAuth client and allowed origin stay the same; only Steps 1.2–1.4 and 6.1–6.4 change. React is worth it once there are several entities, shared form components, filters and validation. Use **Vite**; Create React App is deprecated.

**Create the project** (Node.js LTS installed locally):

```bash
npm create vite@latest <repo> -- --template react   # or react-ts
cd <repo>
npm install
npm install react-router-dom                         # only if you need several screens
```

**Set the base path.** The site is served from `/<repo>/`, not the root. Without this the built page loads blank.

```javascript
// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/<repo>/'      // use '/' only for <username>.github.io or a custom domain
});
```

**Config values.** Put them in `.env` (committed is fine, both are public) and read them as `import.meta.env.VITE_GOOGLE_CLIENT_ID` and `import.meta.env.VITE_API_URL`. Anything prefixed `VITE_` is baked into the public bundle at build time, so never put a secret there, and rebuild after changing a value.

```bash
# .env
VITE_GOOGLE_CLIENT_ID=XXXX.apps.googleusercontent.com
VITE_API_URL=https://script.google.com/macros/s/XXXX/exec
```

**Deploy with GitHub Actions.** The repo holds source code; a workflow builds it and publishes `dist/` on each push to `main`.

1. Repo **Settings → Pages → Build and deployment → Source:** GitHub Actions (instead of *Deploy from a branch*).
2. Add `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: lts/*
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

The action versions above were current when written; compare with the GitHub Pages section of Vite's deploy guide and use the latest major versions. A `.nojekyll` file is not needed with this method.

**Google sign-in in React.** Either load the same GSI script and call `google.accounts.id.initialize` inside a `useEffect` in a `SignIn` component, or use the `@react-oauth/google` package (`GoogleOAuthProvider` + `GoogleLogin`), whose `onSuccess` returns the same `credential`. Keep the token and user in a React context, and pass the token to the same `api()` function from 6.4.

**Routing.** GitHub Pages cannot serve deep links such as `/items/42`; a refresh there returns 404. Use `HashRouter` (URLs like `/#/items/42`), or keep one screen with no router.

**Suggested layout:**

```
src/
├── main.jsx               # GoogleOAuthProvider / AuthProvider, HashRouter
├── auth/AuthContext.jsx   # token, user, signOut, re-sign-in on AUTH_REQUIRED
├── api/client.js          # api(action, payload) from 6.4
├── components/            # RecordTable, RecordForm, ConfirmDialog, Toast
└── pages/                 # one folder per entity from the functional spec
```

Local development runs on `npm run dev` (port 5173 by default). Add `http://localhost:5173` to the OAuth client's JavaScript origins, or start Vite with `--port 8000` to reuse the existing entry.

## Security model and checklist

Only listed people can read or change data. Every other path is closed by a specific control, and the worst case from a trusted user is recoverable.

| Threat | What stops it |
| --- | --- |
| A stranger opens the site | Sees only the sign-in button; no data is in the page or the repo |
| A stranger signs in with their own Google account | Blocked by Testing status (not a test user) and by the allow-list (`FORBIDDEN`) |
| Someone calls the API URL directly, with no token or a fake one | `tokeninfo` rejects it (`AUTH_REQUIRED`) |
| A real Google token issued to some other app | Audience check against `GOOGLE_CLIENT_ID` |
| A stolen token is replayed | Expires in about 1 hour; HTTPS everywhere; token never in URLs |
| A removed user keeps the page open | Allow-list is checked on every request, so access ends immediately |
| An allowed user deletes or overwrites records | Soft delete, audit log, conflict check, Sheet version history |
| Malicious text or formulas in input | Field allow-list, type checks, apostrophe prefix for `= + - @` |
| Stored text that runs as script in other users' browsers | Rendering with `textContent`, never `innerHTML` |
| Two users saving at once | `LockService` plus the `expectedUpdatedAt` check |
| The script being used to reach other Drive files | `spreadsheets.currentonly` scope; no Drive scope at all |
| Secrets leaking from the public repo | Repo holds only the client ID and API URL, both public by design |
| Owner account takeover | 2-Step Verification on the Google and GitHub owner accounts |

Before sharing the link:

- [ ] OAuth app is in **Testing**, and only intended emails are test users
- [ ] `ALLOWED_EMAILS` matches the test users, lowercase
- [ ] Manifest lists exactly the two scopes; the consent screen showed nothing broader
- [ ] Repo contains no client secret, no email list, no Sheet ID
- [ ] A non-listed Google account gets blocked (test with a spare account)
- [ ] `curl -X POST <API_URL> -d '{}'` returns `AUTH_REQUIRED`
- [ ] Deleting a record in the app leaves the row in the Sheet with `deleted = TRUE`
- [ ] Sheet sharing shows only the owner
- [ ] 2-Step Verification is on for both owner accounts

## Local testing and troubleshooting

Test locally on `http://localhost:8000` against the deployed `/exec` API. Both localhost origins are already registered in Step 2.

```bash
cd <repo>
python3 -m http.server 8000
# open http://localhost:8000
```

Backend logs: open the script editor, then **Executions** (left sidebar). Each request appears with its `console` output and errors.

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `origin_mismatch` or “origin is not allowed” on sign-in | Origin missing or written with a path or trailing slash | Add exactly `https://<username>.github.io`; wait up to a few hours after changes |
| “Access blocked” / `access_denied` on Google sign-in | Email is not a test user | Add it under Google Auth Platform → Audience → Test users |
| Sign-in button does not appear | GSI script not loaded yet, wrong client ID, or browser blocks third-party cookies | Call `initAuth` on `load`; check the ID; try another browser; the button still works without One Tap |
| CORS error in the console | `Content-Type` is not `text/plain`, URL is `/dev`, or access is not *Anyone* | Fix the header, use `/exec`, redeploy with access *Anyone* |
| Response is an HTML Google login page | Deployment access is not *Anyone* | Manage deployments → edit → Who has access: Anyone |
| `FORBIDDEN` for someone who should have access | Email missing from `ALLOWED_EMAILS`, or a typo, space or capital letter | Fix the Script Property; no redeploy needed |
| Backend changes not taking effect | No new version was deployed | Manage deployments → pencil → New version |
| Frontend changes not visible | Browser cache or Pages still building | Bump `?v=`, hard refresh, check the Actions tab |
| GitHub Pages 404 | Wrong branch or folder, or `index.html` not at the root | Settings → Pages: `main` and `/ (root)`; check file name case |
| `Server error` responses | Exception in the script | Read the stack trace in Executions |
| Requests time out under load | Lock wait over 10 seconds | Fine for a few users; if frequent, reduce work done inside the lock |

## Maintenance

Day-to-day changes need no redeploy: people are managed in two lists, frontend changes go live on push, and backend changes need a new version.

| Task | Steps | Redeploy? |
| --- | --- | --- |
| Add a person | 1) Add their email under Audience → Test users. 2) Add it to `ALLOWED_EMAILS` | No |
| Remove a person | Remove from `ALLOWED_EMAILS` (access ends on their next request), then from Test users | No |
| Change the frontend | Commit to `main`, bump `?v=` | Pages rebuilds in about a minute |
| Change the backend | Edit, copy to `apps-script/` in the repo for history, Manage deployments → New version | Yes, same URL |
| Undo one deletion | Set `deleted` to `FALSE` in the Sheet, or use `restore` in the app | No |
| Roll back the whole Sheet | Sheet → File → Version history → restore a version | No |
| Over 100 users | Publish the OAuth app to Production (basic scopes need no verification); the allow-list remains the only gate | No |

Optional backups: add a weekly time-driven trigger from the editor's **Triggers** page (clock icon) that copies each entity tab to a dated `Backup_YYYY-MM-DD` tab in the same spreadsheet. This stays within the `currentonly` scope. Keep the last few backups and delete older ones.

Optional cleanup: purge rows soft-deleted more than N days ago, with N set in the functional spec.

## Limitations

For a few people, no quota here will be reached. The limits users notice are 1–3 second responses and no live updates. Figures are for a free consumer (Gmail) account and were checked on 2026-11-14.

| Area | Limit | Impact on this app |
| --- | --- | --- |
| GitHub Pages | 1 GB published site; soft 100 GB/month bandwidth; deployments time out after 10 min ([GitHub](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)) | None; the app is a few MB |
| GitHub Pages | Soft 10 builds/hour, not applied to GitHub Actions deploys | None with the React/Actions setup |
| GitHub Pages | Public repo on the free plan; static files only; no deep-link URLs | No secrets in the repo; use `HashRouter` for screens |
| Apps Script | URL Fetch: 20,000 calls/day (100,000 on Workspace) ([Google](https://developers.google.com/apps-script/guides/services/quotas)) | One call per uncached token check; caching keeps usage far below this |
| Apps Script | 30 simultaneous executions per user, 1,000 per script | Runs as the owner, so the 30 likely applies; writes are serialized by the lock anyway |
| Apps Script | 6 minutes per execution | No long jobs inside one request |
| Apps Script | Properties read/write: 50,000/day | One allow-list read per request; fine |
| Apps Script | Trigger runtime: 90 min/day | Only scheduled backups use it; seconds per run |
| Apps Script | Always HTTP 200; no CORS settings; URL is always `script.google.com` | Errors live in the JSON body; use `text/plain`; no custom API domain |
| Apps Script | About 1–3 s per request, slower after idle | Show loading states; batch reads |
| Google Sheets | 10 million cells per spreadsheet, blank cells included (some newer guides cite 20 million); 50,000 characters per cell | Slows down long before that; expect sluggish lists past a few thousand rows per tab |
| Google Sheets | No keys, constraints, transactions or server-side queries | Integrity rules live in the script; filtering happens in code |
| Google sign-in | 100 test users in Testing status; ID token lasts about 1 hour | Handle re-sign-in; past 100 users, publish and rely on the allow-list |
| Google sign-in | Some browsers block third-party cookies | One Tap may not appear; the button still works |
| React on Pages | `base` must match `/<repo>/`; `VITE_` values are fixed at build time and public | Blank page if wrong; rebuild after config changes |

Move the backend to a managed database (for example Firebase or Supabase) and keep the frontend if any of these appear: dozens of people editing at once, tens of thousands of records, data that must update live, or sensitive data such as payments or health records.

## Functional spec (to be added)

The functional details will fill this section. Implementation needs the following:

- **Entities:** each record type and its tab name.
- **Fields per entity:** name, type (text, number, date, enum, boolean, email, URL), required, limits, allowed values, default.
- **Relationships:** for example a task belongs to a project (stored as the parent `id`).
- **Roles:** whether everyone has equal rights, or there are viewers, editors and admins, and what each can do.
- **Screens:** list views, detail view, create and edit forms, and what each shows.
- **List features:** search, filters, sorting, pagination, export to CSV.
- **Business rules:** for example “status can only move forward” or “due date cannot be in the past”.
- **Volume:** expected number of users and records per entity.
- **Look and feel:** colours, logo, light or dark theme, mobile use.

## Implementation checklist

- [ ] Step 1: public repo created, Pages live, `PAGES_URL` and `PAGES_ORIGIN` recorded
- [ ] Step 2: Cloud project, Google Auth Platform in Testing, test users added, Web client ID created
- [ ] Step 3: Sheet with entity tabs, system columns and `AuditLog`
- [ ] Step 4: manifest scopes, Script Properties, `verifyUser_`, router, CRUD handlers per the spec
- [ ] Step 5: authorized, deployed as Me / Anyone, `API_URL` recorded, `doGet` check passes
- [ ] Step 6: `config.js`, sign-in, API client, CRUD screens per the spec
- [ ] Security checklist passed, including the stranger-account test
- [ ] Link shared with the allowed people

## Sources

- [Manage OAuth Clients (Google Cloud Help)](https://support.google.com/cloud/answer/15549257): Google Auth Platform Clients page, JavaScript origin rules, propagation delay
- [Google OAuth setup in the new console layout](https://edgebase-docs-wgz.pages.dev/docs/authentication/oauth/google): Branding, Audience, Data Access and Clients split; Testing status limits sign-in to test users
- [GitHub Pages limits (GitHub Docs)](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits): site size, bandwidth, build and deployment limits
- [Apps Script quotas (Google for Developers)](https://developers.google.com/apps-script/guides/services/quotas): URL Fetch, simultaneous executions, Properties and trigger quotas
- [Deploying a static site: GitHub Pages (Vite)](https://vite.dev/guide/static-deploy): `base` setting and the GitHub Actions workflow
- [Google Sheets cell limit raised to 10 million (Google Workspace Updates)](https://workspaceupdates.googleblog.com/2022/03/ten-million-cells-google-sheets.html)
