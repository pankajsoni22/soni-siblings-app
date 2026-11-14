# Architecture: Lending Commission Tracker

Nov 14, 2026 · Companion to [requirements.md](requirements.md) and [development-plan.md](development-plan.md)

The app is a static React site that talks to one Apps Script API, which is the only thing that can read or write the private Google Sheet. The browser holds no data. Every request carries a Google sign-in token, and the API checks the token, the user's role and the input before it touches the Sheet.

This document describes the **target** architecture, the state after phases 1–7 of the development plan. Today the repo has the scaffold: sign-in, the typed API client and a generic CRUD backend. Section 11 lists what still has to change.

## 1. System context

```mermaid
flowchart LR
    subgraph people["People"]
        admin["Admin"]
        userw["User-W"]
        userro["User-RO"]
        stranger["Anyone else"]
    end

    subgraph github["GitHub"]
        pages["GitHub Pages<br/>React app (static files)"]
    end

    subgraph google["Google"]
        gis["Google Identity Services<br/>sign-in, ID token"]
        tokeninfo["tokeninfo endpoint<br/>verifies tokens"]
        api["Apps Script web app<br/>the API"]
        sheet[("Private Google Sheet<br/>the database")]
    end

    admin & userw & userro --> pages
    stranger -. "sees sign-in only, then 'No access'" .-> pages
    pages -- "sign in" --> gis
    pages -- "POST action + token" --> api
    api -- "check token" --> tokeninfo
    api -- "read / write" --> sheet
    admin -. "owner opens directly" .-> sheet
```

| Component | Runs on | Responsibility | Holds secrets or data? |
| --- | --- | --- | --- |
| React app | GitHub Pages (public repo) | Screens, live calculations, CSV export, sign-in button | No. Only the public Client ID and API URL. |
| Google Identity Services | Google | Signs the user in; returns an ID token valid for about 1 hour | No |
| Apps Script API | Google, runs as the owner | Verifies every request, checks role, validates, recalculates, writes under a lock, logs every change | Script Properties: `GOOGLE_CLIENT_ID`, `OWNER_EMAIL` |
| Google Sheet | Owner's Google Drive | Users, partners, transactions, shares, settings, audit log | Yes. All business data; shared with nobody. |

## 2. Life of a request

Every API call follows this path; reads and writes differ only in the last step.

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant R as React app
    participant G as Google Identity Services
    participant A as Apps Script API
    participant T as tokeninfo
    participant S as Google Sheet

    U->>R: Open the app
    R->>G: Sign in (One Tap or button)
    G-->>R: ID token, valid about 1 hour
    U->>R: Do something (e.g. save a loan)
    R->>A: POST action, token, payload (text/plain)
    A->>T: Verify token (result cached up to 5 min)
    T-->>A: email, audience, expiry
    A->>S: Look up email in Users tab
    alt Allowed and role permits the action
        A->>S: Read, or write under lock and append to AuditLog
        A-->>R: ok true, data
        R-->>U: Show result or confirmation
    else Not on the list, or role not permitted
        A-->>R: ok false, FORBIDDEN
        R-->>U: "No access" or a message
    end
```

The body is sent as `text/plain` on purpose. A JSON content type would trigger a browser pre-check (CORS preflight) that Apps Script cannot answer. Apps Script always replies with HTTP 200, so the outcome lives in the `ok` field of the reply.

## 3. Checks on every request

The API trusts nothing from the browser except a token signed by Google. The checks run in this order and stop at the first failure.

```mermaid
flowchart TD
    req["Request arrives"] --> parse{"Body is valid JSON?"}
    parse -- no --> e0["VALIDATION"]
    parse -- yes --> tok{"Google token valid,<br/>issued for this app,<br/>not expired?"}
    tok -- no --> e1["AUTH_REQUIRED"]
    tok -- yes --> usr{"Email active in Users tab,<br/>or equals OWNER_EMAIL?"}
    usr -- no --> e2["FORBIDDEN"]
    usr -- yes --> perm{"Role allowed<br/>for this action?"}
    perm -- no --> e3["FORBIDDEN"]
    perm -- yes --> val{"Input valid?<br/>known fields, types,<br/>limits, shares = 100%"}
    val -- no --> e4["VALIDATION"]
    val -- yes --> write{"Is it a write?"}
    write -- no --> read["Read the tabs once,<br/>filter and total in memory"]
    write -- yes --> lock["Take the script lock,<br/>check expectedUpdatedAt,<br/>write rows, append AuditLog"]
    lock -- "someone saved first" --> e5["CONFLICT"]
    lock --> ok["ok true, data"]
    read --> ok
```

## 4. Sign-in and session states

The frontend's `AuthProvider` (`src/auth/AuthProvider.tsx`) moves between these states. The `expired` state keeps the screen mounted, so nothing typed is lost while the user signs in again.

```mermaid
stateDiagram-v2
    [*] --> loading
    loading --> signedOut: Google script ready
    loading --> signedOut: script blocked (error shown)
    signedOut --> checking: Google returns a token
    checking --> ready: API confirms the email (me)
    checking --> forbidden: not on the Users list
    checking --> signedOut: network or server error
    ready --> expired: token near expiry or rejected
    expired --> ready: same person signs in again
    expired --> checking: a different account signs in
    ready --> [*]: sign out (page reloads)
    forbidden --> [*]: sign out (page reloads)
```

## 5. Roles

Roles live in the Users tab. `OWNER_EMAIL` is always an admin, so the app can never be left without one.

```mermaid
flowchart LR
    subgraph roles["Roles"]
        A["Admin"]
        W["User-W"]
        R["User-RO"]
    end

    view["View dashboard, reports,<br/>transactions, export CSV"]
    write["Add, edit, delete transactions,<br/>mark repaid, undo own delete"]
    manage["Partners and default shares,<br/>users and roles, settings,<br/>restore deleted, full history"]

    R --> view
    W --> view
    W --> write
    A --> view
    A --> write
    A --> manage
```

The server enforces the permission table in the API router. The frontend uses the same table only to hide buttons a role cannot use.

## 6. Data model

One tab per entity, one row per record, headers in row 1. Columns are found by header name, and all cells are stored as plain text.

```mermaid
erDiagram
    USERS ||--o{ TRANSACTIONS : "creates and edits"
    TRANSACTIONS ||--|{ SHARES : "splits into"
    PARTNERS ||--o{ SHARES : "earns"
    USERS ||--o{ AUDITLOG : "performs"
    TRANSACTIONS ||--o{ AUDITLOG : "history of"

    USERS {
        string id PK
        string email UK "lowercase Google email"
        string role "ADMIN, USER_W or USER_RO"
        boolean active
    }
    PARTNERS {
        string id PK
        string name
        decimal defaultSharePct "active partners total 100"
        boolean active
        int sortOrder
    }
    TRANSACTIONS {
        string id PK
        date txnDate "YYYY-MM-DD, India time"
        string customerName
        decimal amount "rupees, 2 decimals"
        decimal commissionRatePct "default 0.30"
        decimal commission "recalculated by server"
        string repaidStatus "PENDING or REPAID"
        string notes
        string createdBy FK "user email"
        string updatedAt "used for conflict check"
        boolean deleted "soft delete"
    }
    SHARES {
        string id PK
        string transactionId FK
        string partnerId FK
        string partnerName "copied at save time"
        decimal sharePct
        decimal earning "rupees, 2 decimals"
    }
    SETTINGS {
        string key PK "e.g. defaultCommissionRatePct"
        string value
    }
    AUDITLOG {
        string timestamp
        string email FK
        string action "create, update, delete, restore"
        string entity
        string recordId
        string changes "old and new values as JSON"
    }
```

Users, Partners, Transactions and Shares also carry the system columns `createdAt`, `createdBy`, `updatedAt`, `updatedBy`, `deleted`, `deletedAt` and `deletedBy`. Shares copy the partner's name and percentage at save time, so later changes to partners never alter past reports.

## 7. Saving a transaction

The form shows live figures, but the server recalculates and saves its own. Both sides are tested against the same cases in `shared/calc-cases.json`.

```mermaid
sequenceDiagram
    autonumber
    participant F as Transaction form
    participant A as Apps Script API
    participant L as Script lock
    participant S as Google Sheet

    F->>F: Live commission and earnings (src/lib/money.ts)
    F->>A: saveTransaction(transaction, shares, expectedUpdatedAt)
    A->>A: Check role is Admin or User-W, validate fields
    A->>A: Recalculate in paise (Money.gs), shares must total 100
    A->>L: Acquire (waits up to 10 s)
    A->>S: Read the transaction's current row
    alt Someone saved it after the form was opened
        A->>L: Release
        A-->>F: CONFLICT, form reloads the latest version
    else New, or unchanged since opened
        A->>S: Write the Transactions row
        A->>S: Replace this transaction's Shares rows
        A->>S: Append an AuditLog row
        A->>L: Release
        A-->>F: Saved record with the server's figures
        F->>F: Confirmation repeats the saved figures
    end
```

Money rules: amounts are calculated as whole paise. Commission = round(amount × rate ÷ 100). Each earning = commission × share ÷ 100, rounded down, and the last partner takes the leftover paisa, so the earnings always add up exactly to the commission.

## 8. Transaction lifecycle

```mermaid
stateDiagram-v2
    [*] --> Active: saved
    state Active {
        [*] --> Pending
        Pending --> Repaid: mark repaid
        Repaid --> Pending: mark pending
    }
    Active --> Active: edit (Admin or User-W, audited)
    Active --> Deleted: delete (Admin or User-W)
    Deleted --> Active: undo within 10 s (person who deleted)
    Deleted --> Active: restore (Admin)
```

Nothing is ever removed from the Sheet. A deleted transaction is hidden from lists and totals, keeps who deleted it and when, and can be brought back.

## 9. Frontend structure

Dependencies point downwards only: pages use components and hooks, and only `ApiClient` talks to the network.

```mermaid
flowchart TB
    subgraph app["App shell (src/App.tsx, HashRouter)"]
        nav["Role-aware navigation<br/>and route guards"]
    end

    subgraph pages["Pages (src/pages)"]
        dash["Dashboard"]
        txns["Transactions"]
        form["Transaction form"]
        partners["Partners"]
        users["Users"]
        settings["Settings"]
        deleted["Deleted"]
    end

    subgraph ui["Shared components (src/components)"]
        comps["Money, DateText, PeriodPicker,<br/>ConfirmDialog, FormField, Toast,<br/>SessionExpiredDialog"]
    end

    subgraph logic["Logic (src/lib)"]
        money["money.ts<br/>paise, rounding, splits"]
        fy["fy.ts<br/>financial year, quarters"]
        csv["csv.ts<br/>export"]
    end

    subgraph data["Data access (src/api, src/auth)"]
        useApi["useApi hook"]
        client["ApiClient<br/>typed methods"]
        auth["AuthProvider<br/>session state"]
    end

    app --> pages
    pages --> ui
    pages --> logic
    pages --> useApi
    useApi --> client
    useApi --> auth
    client -- "fetch, text/plain" --> backend["Apps Script API"]
```

## 10. Backend structure

The Apps Script files share one global scope, but each file has one job, and only `Sheet.gs` touches the spreadsheet.

```mermaid
flowchart TB
    entry["Router.gs<br/>doPost, doGet,<br/>permission table, error mapping"]

    subgraph services["Actions"]
        authm["Auth.gs<br/>verify token, load user"]
        usersm["Users.gs<br/>list, save, remove,<br/>last-admin and owner rules"]
        partnersm["Partners.gs<br/>save whole list, 100% rule"]
        txnm["Transactions.gs<br/>save, repaid, delete,<br/>restore, history"]
        reportm["Reports.gs<br/>totals, by partner,<br/>by month, pending"]
    end

    subgraph core["Core"]
        moneym["Money.gs<br/>paise calculations"]
        sheetm["Sheet.gs<br/>read tables, write rows,<br/>plain-text cells, lock, audit"]
    end

    sheet[("Google Sheet")]

    entry --> authm
    entry --> usersm & partnersm & txnm & reportm
    authm --> sheetm
    usersm --> sheetm
    partnersm --> sheetm
    txnm --> moneym
    txnm --> sheetm
    reportm --> moneym
    reportm --> sheetm
    sheetm --> sheet
```

## 11. Build and deployment

The frontend deploys on every push to `main`. The backend deploys by hand as a new version of the same deployment, so its `/exec` URL never changes.

```mermaid
flowchart LR
    dev["Developer"]

    subgraph fe["Frontend"]
        push["git push main"]
        ci["GitHub Actions<br/>lint, unit tests, backend tests,<br/>typecheck, build"]
        ghp["GitHub Pages<br/>pankajsoni22.github.io/soni-siblings-app"]
    end

    subgraph be["Backend"]
        clasp["npm run deploy:backend<br/>(clasp push)"]
        project["Apps Script project<br/>bound to the Sheet"]
        version["Manage deployments<br/>new version"]
        exec["/exec URL<br/>unchanged"]
    end

    dev --> push --> ci -- "dist/" --> ghp
    dev --> clasp --> project --> version --> exec
    ghp -. "calls" .-> exec
```

What still has to change from today's scaffold:

| Today | Target |
| --- | --- |
| One `Code.gs`, pasted into the editor | Separate `.gs` files, pushed with clasp |
| `ALLOWED_EMAILS` / `ADMIN_EMAILS` Script Properties, `isAdmin` flag | Users tab with three roles, plus `OWNER_EMAIL` |
| Generic `list/get/create/update/delete/restore` on a sample `Items` tab | Dedicated actions for transactions, partners, users, reports and settings |
| Google sign-in in Testing mode with test users | Production mode; the Users tab is the gate |
| Home page placeholder | Dashboard, Transactions, form, and admin screens |

## 12. Security layers

```mermaid
flowchart TB
    l1["1. Website holds no data<br/>public repo has only Client ID and API URL"]
    l2["2. Google sign-in token<br/>signed by Google, checked for this app and expiry"]
    l3["3. Users tab allow-list<br/>checked on every request, removal is immediate"]
    l4["4. Role permission per action<br/>enforced on the server"]
    l5["5. Input validation and recalculation<br/>known fields only, formula-safe text"]
    l6["6. Locked writes and conflict check<br/>no silent overwrites"]
    l7["7. Audit log, soft delete, Sheet version history<br/>every change traceable and reversible"]
    l8["8. Narrow script permissions<br/>this spreadsheet only, no Drive access"]

    l1 --> l2 --> l3 --> l4 --> l5 --> l6 --> l7 --> l8
```

## 13. Key design decisions

| Decision | Why |
| --- | --- |
| Google Sheet as the database | Required; free; the owner can inspect and back it up. Sized for a few users and thousands of rows. |
| One API in front of the Sheet | Users never get Sheet access, so every rule is enforced in one place. |
| Server recalculates every figure | The screen's numbers are a preview; saved numbers can't be tampered with from the browser. |
| Integer paise for money | Avoids floating-point rounding errors in totals. |
| Shares copied onto each transaction | Changing partners or default shares never rewrites past reports. |
| Soft delete plus audit log | Nothing is lost; every change shows who and when. |
| `updatedAt` conflict check | Two people editing the same entry can't overwrite each other silently. |
| Plain-text cells and a formula escape | Sheets never turns IDs or dates into other types and never runs typed text as a formula. |
| `HashRouter` | GitHub Pages can't serve deep links like `/transactions/42`. |
| Token in the request body, `text/plain` | Keeps tokens out of URLs and logs; avoids a CORS pre-check Apps Script can't answer. |
