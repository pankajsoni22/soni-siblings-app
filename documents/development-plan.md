# Development Plan: Lending Commission Tracker

Nov 14, 2026 · Based on [requirements.md](requirements.md) and the [setup guide](CRUD%20App%20Setup%20Guide%20GitHub%20Pages%20+%20Google%20Sign-In%20+%20Google%20Sheets.md)

The app is built in eight phases (0–7). Each one ends with something deployed and tested, starting from the scaffold already in the repo. Your own tasks (Google and GitHub setup, IDs to send me) are in [section D](#d-action-items-for-you). Items 1–8 can start today.

**Decisions taken on 2026-11-14** (added to the requirements):

- Commission counts as earned on the transaction date, even while the loan is Pending. Pending amounts are shown separately.
- User-RO sees everything, read only.
- A commission rate above 2% asks "Are you sure?" before saving.
- CSV export of the selected period is in the first version.
- Everyone sees all partners' earnings. No customer phone number in v1.

## A. Approach

- **Vertical slices.** Each phase ends with something deployable and tested, so problems show up early rather than at the end.
- **Backend split into files.** `Code.gs` becomes `Router.gs`, `Auth.gs`, `Users.gs`, `Partners.gs`, `Transactions.gs`, `Reports.gs`, `Money.gs` and `Sheet.gs`. `Sheet.gs` holds the read/write helpers that already exist and are tested: `readTable_`, `writeCells_`, `appendRow_`, `toCell_`/`fromCell_`, `withLock_` and `audit_`.
- **Deployed with clasp.** `npx @google/clasp push` sends the backend from the repo, so the repo is the single source and nothing is copy-pasted. Copy-paste stays available as a fallback.
- **Shared test cases for calculations.** Live figures on screen come from the frontend; the figures that get saved come from the backend. Both are tested against one file, `shared/calc-cases.json`, which lists amount, rate and shares with the expected commission and earnings in paise. If either side drifts, its tests fail.
- **Money and dates.** Integer paise everywhere in code. Display goes through `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`. Dates are `YYYY-MM-DD` in India time. Financial-year helpers live in one module on each side.
- **Frontend reuse.** Keep `ApiClient`/`useApi`, `AuthProvider`/`useAuth`, `ToastProvider`, `ApiError` and `HashRouter`. Add role-aware routes, a small set of shared components, and Vitest for unit tests.

## B. Phases

| # | Phase | Main work | Done when |
| --- | --- | --- | --- |
| 0 | Owner setup (you) | Items in section D, done alongside phases 1–2 | Client ID, Script ID and `/exec` URL received; Pages source set |
| 1 | Backend foundation | Split into files and set up clasp. Add the `Users`, `Partners` and `Settings` tabs. Make `OWNER_EMAIL` the permanent admin. Roles ADMIN, USER_W and USER_RO replace `ALLOWED_EMAILS`/`ADMIN_EMAILS`. The router checks a permission table. `setup()` creates the new tabs and adds the owner. | Tests cover role checks, the last-admin and owner rules, and adding, removing and changing users |
| 2 | Backend business logic | `Money.gs`: paise and rounding, with the leftover paisa going to the last partner. `saveTransaction` writes Transactions and Shares under one lock and recalculates on the server. `setRepaid`, soft delete, and `restoreTransaction` (admin, or the deleter within 10 s; the server allows 30 s for network delay). `getHistory`. `listTransactions` and `report` by date range: FY quarters, by partner, by month, and pending. `savePartners` saves the whole list, which must total 100%. `saveSettings`. | Shared calc cases pass. Tests cover conflicts, the undo window, inactive partners in reports, and deleted rows staying out of totals |
| 3 | Frontend foundation | Types and `ApiClient` methods for every action. Role-aware navigation and route guards. App shell: bottom bar on phone, side menu on laptop. Shared components: `Money`, `DateText`, `PeriodPicker`, `ConfirmDialog`, `FormField`, plus loading and empty states. `money.ts`, `fy.ts` and `csv.ts`, tested with Vitest against the shared cases. | Builds, lints and unit tests pass; each role sees the right menu |
| 4 | Core screens | **Transaction form:** live commission and per-partner earnings, reset to defaults and split equally, 100% total check, confirmation for rates above 2%, save and save-and-add-another, confirmation repeating the saved figures. **Transactions list:** period, search, Pending/Repaid filter, one-tap repaid, edit, delete with 10 s Undo, CSV export. **Dashboard:** period picker, totals, pending amount, earnings by partner, month-by-month chart, CSV export. | A User-W can record, edit, delete, undo and export on a phone |
| 5 | Admin screens | Partners: defaults, running total, deactivate. Users: add, change role, remove, with clear messages for the last-admin and owner rules. Settings: default commission rate. Deleted view with restore. Change history for each transaction. | The admin can run the business without opening the Sheet |
| 6 | Hardening | Errors and retry, session expiry mid-form, two people editing at once, slow network. Accessibility: keyboard, contrast, screen-reader labels. Phone layout at 360 px wide. The setup guide's security checklist, with the "Testing mode" items replaced by Production plus the allow-list. | Every checklist item passes on the deployed app |
| 7 | Go-live | Real `.env` values and deploy. The owner adds partners and users. Acceptance test with the partners (section E). Weekly backup trigger. | Partners sign off; first real week of entries recorded |

## C. Files touched

- **Backend:** `apps-script/*.gs`, `apps-script/appsscript.json` (scopes stay the same two), `.clasp.json` (holds the Script ID, kept out of git), `apps-script/test/*.test.cjs`, `shared/calc-cases.json`
- **Frontend:** `src/api/types.ts`, `src/api/ApiClient.ts`, `src/lib/money.ts`, `src/lib/fy.ts`, `src/lib/csv.ts`, `src/components/*`, `src/pages/{Dashboard,Transactions,TransactionForm,Partners,Users,Settings,Deleted}/*`, `src/App.tsx` (routes)
- **Tooling:** `package.json` (adds vitest, `@google/clasp`, and `test` and `deploy:backend` scripts), `.github/workflows/deploy.yml` (adds `npm test`)

## D. Action items for you

Do these in order. **Send me** marks the three things I need from you to continue.

| # | Action | Where | Result |
| --- | --- | --- | --- |
| 1 | Turn on 2-Step Verification for your Google and GitHub accounts | Google Account → Security; GitHub → Settings → Password and authentication | Accounts protected |
| 2 | Make sure the repo `pankajsoni22/soni-siblings-app` is **Public**, and set Pages **Source: GitHub Actions** | GitHub repo → Settings → General, then Pages | The deploy workflow can publish the site |
| 3 | Create a Google Cloud project and register the app in **Google Auth Platform**: External, app name, support email, no logo, no extra scopes. Then click **Publish app** to move it to Production. | console.cloud.google.com | Anyone can reach sign-in; the app's own list decides who gets in |
| 4 | Create an OAuth client of type **Web application**. JavaScript origins: `https://pankajsoni22.github.io`, `http://localhost`, `http://localhost:8000`. No redirect URIs. | Google Auth Platform → Clients | **Send me the Client ID** (ends in `.apps.googleusercontent.com`) |
| 5 | **Do not send me the client secret.** The app never uses it. Don't store it anywhere in the repo. | — | — |
| 6 | Create the Google Sheet in your account (for example "Soni Lending DB"), then open **Extensions → Apps Script** | Google Drive | **Send me the Script ID** (Apps Script → Project Settings → IDs) |
| 7 | Turn on the Apps Script API for your account. Then run `npx @google/clasp login` in the project folder on your machine. The login stays on your machine; I never see it. | script.google.com/home/usersettings; your terminal | I can push the backend from the repo |
| 8 | Add Script Properties `GOOGLE_CLIENT_ID` (from item 4) and `OWNER_EMAIL` (your Google email) | Apps Script → Project Settings → Script Properties | The backend knows the app and its owner |
| 9 | After I push the backend (end of phase 1): run `setup` once and approve the permissions. It should ask only for "this spreadsheet" and "connect to an external service". Then **Deploy → New deployment → Web app**, Execute as **Me**, Who has access **Anyone**. | Apps Script editor | **Send me the `/exec` URL** |
| 10 | Have a spare Google account that is *not* on the list, for the "stranger is blocked" test | — | Security test in phase 6 |
| 11 | Prepare the partner list with default shares (they must total 100%), and the people and roles to invite. You'll enter these in the app at go-live. | — | Ready for phase 7 |
| 12 | Book 30 minutes with the partners for acceptance testing | — | Sign-off in phase 7 |

Items 1–8 can start now. Item 9 follows phase 1. Items 10–12 are for phases 6–7.

**What you send me, in total:** the Client ID (item 4), the Script ID (item 6) and the `/exec` URL (item 9). All three are public identifiers, not secrets.

## E. Testing and acceptance

- **Automated, in CI on every push:** lint, typecheck, Vitest unit tests (money, FY periods, CSV, form logic), and the backend tests (sign-in, roles, every action, the shared calc cases).
- **Manual, on the deployed app after each phase:**
  - Sign in as each role.
  - Record 3 loans on a phone. Edit one; delete one and undo it.
  - Edit the same entry in two browsers; the second save gets a conflict message.
  - Let the sign-in expire mid-form; signing in again keeps what was typed.
  - The stranger account is blocked, and `curl -X POST <exec URL> -d '{}'` returns `AUTH_REQUIRED`.
  - A User-RO sees no write buttons, and a direct write call from them is refused.
- **Acceptance with the partners:** each partner enters a realistic loan, checks the dashboard for this month and this quarter, finds their own earnings line, and exports a CSV. The admin adds and then removes a test user.

## F. Risks to watch

- **Speed:** Apps Script takes about 1–3 s per call. Keep to one call per screen load and do the heavy work on the server.
- **Schema in two places:** the fields are defined in both `src/api/types.ts` and the `.gs` files. Phase 1 adds a test that compares the two field lists.
- **Open sign-in step:** in Production, anyone with a Google account can reach sign-in. The allow-list check on every request is what keeps them out, and the tests must cover it.
