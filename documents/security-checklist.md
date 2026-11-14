# Security and go-live checklist

Run this against the live deployment before giving the link to the partners, and again after any change to sign-in, roles or deployment settings. It adapts the setup guide's checklist to this app: Google sign-in is in **Production** mode, so the app's own **Users** tab is what keeps strangers out.

Each item says who does it and what you should see. Tick it when it passes.

## A. Automated (anyone with the repo)

- [ ] `npm run lint && npm test && npm run test:backend && npm run build` all pass. They also run on every push.
- [ ] `npm run smoke:backend` passes against the live `/exec` URL. It checks that the API answers, refuses requests with no token or a made-up token (`AUTH_REQUIRED`), rejects malformed requests, and leaks no internals in error messages.

## B. Accounts and settings (owner)

- [ ] 2-Step Verification is on for the owner's Google account and GitHub account.
- [ ] Google Auth Platform → Audience shows **In production**. Data Access lists no scopes beyond sign-in.
- [ ] The OAuth client's JavaScript origins are exactly `https://pankajsoni22.github.io`, `http://localhost` and `http://localhost:8000`, with no redirect URIs.
- [ ] Apps Script → Project Settings → Script Properties has exactly `GOOGLE_CLIENT_ID` (matching `.env`) and `OWNER_EMAIL`.
- [ ] Apps Script → Deploy → Manage deployments: one web app, **Execute as: Me**, **Who has access: Anyone**.
- [ ] When authorising, Google asked only to "see, edit, create and delete only the specific Google Sheets spreadsheets that this application has been installed in" and to "connect to an external service".
- [ ] The Google Sheet's Share dialog lists only the owner. Optionally, other admins as **Viewer**.
- [ ] The repository contains no client secret. Search the repo for `GOCSPX` and expect only the placeholder in the setup guide.

## C. Access control (owner, plus a spare Google account)

- [ ] A Google account **not** on the Users list can click "Sign in with Google" but then sees **No access** and nothing else.
- [ ] The owner signs in and sees every menu item: Dashboard, Transactions, New entry, Partners, Users, Settings.
- [ ] Add the spare account as **User-RO**. After signing in, it sees only Dashboard and Transactions, with no New entry, Edit, Delete or repaid toggle.
- [ ] Change it to **User-W**. On its next action it can add, edit and delete entries, but has no Partners, Users or Settings.
- [ ] **Remove** it while it has the app open. Its next action fails, and after reloading it sees **No access**.
- [ ] The owner can't be demoted or removed: the Users page shows the owner locked as Admin.

## D. Data integrity (any admin or User-W)

- [ ] Record a loan of ₹5,00,000 at 0.30% with shares 40/30/30. The confirmation says commission ₹1,500.00, and Details shows ₹600 / ₹450 / ₹450.
- [ ] Open the same entry in two browsers, save a change in one, then save in the other. The second sees "Someone else changed this entry…" with the latest version loaded.
- [ ] Delete an entry, then click **Undo** within 10 seconds. It reappears.
- [ ] Delete another and wait. Only an admin can restore it, from Transactions → Deleted entries. The History button shows who deleted it and when.
- [ ] Type `=1+1` as a customer name. It saves and displays as the text `=1+1`, and the Sheet cell shows text, not 2.
- [ ] In the Sheet, the deleted entry's row still exists with `deleted = TRUE`, and AuditLog has a row for every change above.

## E. Session and resilience (any user)

- [ ] Leave the app open for over an hour, then save an entry. A "Session expired" dialog appears. Sign in again and save: nothing typed was lost.
- [ ] Turn off the network and try to save. An "offline" strip appears and the form keeps its contents. Turn the network on and save successfully.
- [ ] On a phone, every screen fits the width without scrolling sideways, and the bottom menu shows all items for your role.

## Already verified in development

These were checked before go-live and don't need repeating unless the code changes.

| Check | How | Result |
| --- | --- | --- |
| Content-Security-Policy allows Google sign-in | Production build served locally; Google's sign-in button rendered under the policy | Passed |
| Accessibility (WCAG rules via axe-core) | Every screen scanned in light and dark mode (`preview.html?axe#/route`) | 0 violations after fixing one contrast issue |
| Phone width | Every main screen rendered at 390 CSS px | Fits; month labels thinned on phones |
| Roles enforced by the server | Backend tests: every action refused for roles not in the permission table | Passed (61 backend tests) |
| Money correctness | Shared calculation cases, run by both the backend and frontend tests | Passed |
