# Soni Siblings

A private CRUD app for a small group. It is a React + TypeScript + Vite app on GitHub Pages with Google sign-in, an Apps Script API and a Google Sheet as the database. Only emails on the allow-list can read or change data.

The full setup steps are in the [setup guide](documents/CRUD%20App%20Setup%20Guide%20GitHub%20Pages%20+%20Google%20Sign-In%20+%20Google%20Sheets.md) (React specifics: section 6.6). The business requirements are in [documents/requirements.md](documents/requirements.md), the architecture in [documents/architecture.md](documents/architecture.md), and the build plan in [documents/development-plan.md](documents/development-plan.md).

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
  api/types.ts                 roles, user and response types (mirror of TABS/ACTIONS in apps-script)
  api/ApiClient.ts             typed client: me, listUsers, saveUser, removeUser
  api/ApiError.ts              error class with a typed `code`
  api/useApi.ts                useApi(): ApiClient bound to the current session
  auth/AuthProvider.tsx        sign-in, token in memory, allow-list check via `me`, expiry
  auth/authContext.ts          AuthStatus, Session and context types; useAuth.ts reads it
  auth/gsi.ts                  Google Identity Services helpers
  auth/SignInButton.tsx
  components/                  TopBar, ToastProvider, SessionExpiredDialog (RecordTable, RecordForm, ... later)
  pages/                       SignIn, NoAccess, Home; one folder per entity from the spec
apps-script/                   the backend, pushed to Apps Script with clasp (not built or served by Pages)
  Config.gs                    roles and the schema of every Sheet tab
  Router.gs                    doPost/doGet, permission table (which role may call which action)
  Auth.gs                      Google token check, owner and Users-tab lookup
  Users.gs                     list, add, change role, remove users
  Validation.gs                input checks
  Sheet.gs                     the only file that reads/writes the Sheet; plain-text cells, audit log
  Setup.gs                     setup(): creates tabs, adds the owner, default settings
  appsscript.json              manifest with the two allowed scopes
  test/                        backend tests against mocked Apps Script services (node --test)
scripts/clasp-config.mjs       writes .clasp.json from SCRIPT_ID in .env
```

## Configure

1. Put the OAuth client ID and the `/exec` URL in `.env`, then rebuild.
2. Put the Apps Script `SCRIPT_ID` in `.env` and run `npx clasp login` once.
3. In Apps Script, set the Script Properties `GOOGLE_CLIENT_ID` and `OWNER_EMAIL`. The owner is always an admin; everyone else is added in the app (Users tab).
4. Run `npm run push:backend`, then in the Apps Script editor run `setup` once to create the tabs and add the owner.
5. GitHub repo **Settings → Pages → Source: GitHub Actions**.

No secrets belong in this repo. Everything prefixed `VITE_` ends up in the public bundle.

## Develop

```bash
npm install
npm run dev        # http://localhost:8000/soni-siblings-app/
npm run lint       # ESLint
npm run typecheck  # tsc
npm run build      # typecheck + production build into dist/
npm run test:backend   # runs apps-script/*.gs against a mocked Sheet
npm run status:backend # lists the files clasp would push
npm run push:backend   # pushes apps-script/ to the Apps Script project
```

`test:backend` covers sign-in, roles and the permission table, user management, setup, and how text and dates are stored. It only checks the logic; it does not replace the security checklist against the real deployment.

Port 8000 matches the `http://localhost:8000` origin registered on the OAuth client. Local dev talks to the deployed `/exec` API.

TypeScript is pinned to 6.0.x because typescript-eslint does not support TypeScript 7 yet.

Calling the API from a component:

```tsx
const api = useApi();
const users = await api.listUsers();                       // AppUser[]
await api.saveUser('someone@gmail.com', 'USER_W');
```

## Release

- Frontend: push to `main`; the workflow builds and deploys in about a minute (see the Actions tab).
- Backend: `npm run push:backend`, then in the Apps Script editor **Deploy → Manage deployments → pencil → New version**. Don't use *New deployment* after the first one, as it changes the URL.
