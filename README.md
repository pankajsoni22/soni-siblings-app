# Soni Siblings

A private CRUD app for a small group. It is a React + TypeScript + Vite app on GitHub Pages with Google sign-in, an Apps Script API and a Google Sheet as the database. Only emails on the allow-list can read or change data.

The full setup steps are in the [setup guide](documents/CRUD%20App%20Setup%20Guide%20GitHub%20Pages%20+%20Google%20Sign-In%20+%20Google%20Sheets.md) (React specifics: section 6.6). The business requirements are in [documents/requirements.md](documents/requirements.md).

## Layout

```
index.html                     Vite entry; loads Google Identity Services
vite.config.ts                 base: '/soni-siblings-app/' (must match the repo name), dev port 8000
tsconfig*.json                 strict TypeScript; app (src/) and node (vite.config.ts) projects
eslint.config.js               typescript-eslint (type-checked), React Hooks, React Refresh
.env                           VITE_APP_NAME, VITE_GOOGLE_CLIENT_ID, VITE_API_URL (all public)
.github/workflows/deploy.yml   lint, typecheck, build and publish dist/ on every push to main
src/
  main.tsx                     providers + HashRouter
  App.tsx                      picks the screen from the auth status; routes
  config.ts                    reads the VITE_ values (typed in vite-env.d.ts)
  styles.css
  api/types.ts                 Entities, record and response types (mirror of ENTITIES in Code.gs)
  api/ApiClient.ts             typed client: me, list, get, create, update, delete, restore
  api/ApiError.ts              error class with a typed `code`
  api/useApi.ts                useApi(): ApiClient bound to the current session
  auth/AuthProvider.tsx        sign-in, token in memory, allow-list check via `me`, expiry
  auth/authContext.ts          AuthStatus, Session and context types; useAuth.ts reads it
  auth/gsi.ts                  Google Identity Services helpers
  auth/SignInButton.tsx
  components/                  TopBar, ToastProvider, SessionExpiredDialog (RecordTable, RecordForm, ... later)
  pages/                       SignIn, NoAccess, Home; one folder per entity from the spec
apps-script/                   copy of the backend for version history (not built, linted or served)
  Code.gs                      token check, allow-list, validation, CRUD, audit log
  appsscript.json              manifest with the two allowed scopes
  test/Code.test.cjs           backend tests against mocked Apps Script services
```

## Configure

1. Put the OAuth client ID and the `/exec` URL in `.env`, then rebuild.
2. In Apps Script, set the Script Properties `GOOGLE_CLIENT_ID`, `ALLOWED_EMAILS` and optionally `ADMIN_EMAILS`.
3. Define entities and fields in `ENTITIES` in `apps-script/Code.gs`, paste it into the Apps Script editor, and run `setup` once to create the tabs and headers. Mirror the same entities in `Entities` in `src/api/types.ts`.
4. GitHub repo **Settings → Pages → Source: GitHub Actions**.

No secrets belong in this repo. Everything prefixed `VITE_` ends up in the public bundle.

## Develop

```bash
npm install
npm run dev        # http://localhost:8000/soni-siblings-app/
npm run lint       # ESLint
npm run typecheck  # tsc
npm run build      # typecheck + production build into dist/
npm run test:backend   # runs apps-script/Code.gs against a mocked Sheet
```

`test:backend` covers the auth gates, validation, CRUD, conflicts, soft delete and the audit log. It only checks the logic; it does not replace the security checklist against the real deployment.

Port 8000 matches the `http://localhost:8000` origin registered on the OAuth client. Local dev talks to the deployed `/exec` API.

TypeScript is pinned to 6.0.x because typescript-eslint does not support TypeScript 7 yet.

Calling the API from a component:

```tsx
const api = useApi();
const items = await api.list('Items');                    // StoredRecord<'Items'>[]
await api.update('Items', item.id, { status: 'Done' }, item.updatedAt);
```

## Release

- Frontend: push to `main`; the workflow builds and deploys in about a minute (see the Actions tab).
- Backend: copy the code to the Apps Script editor, then **Deploy → Manage deployments → pencil → New version**. Don't use *New deployment*, as it changes the URL.
