# Ticket Hygiene Dashboard (standalone app)

A standalone Node.js + Express app for team-segregated backlog health and per-person
hygiene, with two independently-selectable data sources per section:

- **Live Neutara Ticketing (NTA)** — an internal ticketing tool
  (`https://neutaraticketing.cftools.live/`), queried through a server-side proxy (the
  browser never talks to it directly, and your API key never leaves the server). A full
  ticket sync runs on a background schedule (default every 6 hours) plus an on-demand
  "Sync now" — see below for why this isn't queried live per page load.
- **Uploaded Excel export** — for the Customer Engineering / QA / Infra tabs (and optionally
  the "Team tickets by individual" tab), when you'd rather work from a point-in-time export
  than a live connection.

This app previously ran on Jira Cloud's REST API; that integration has been fully removed
in favor of Neutara Ticketing. See "Migration notes" below for what changed and why.

## Install & run

```bash
npm install
npm start
```

Then open `http://localhost:6100` in your browser. The port can be overridden with the
`PORT` environment variable.

## Running with Docker

Everything the app persists (Neutara Ticketing credentials, the synced-ticket cache, any
uploaded Excel file) lives under `data/`, so that's the only directory that needs to survive
a container recreation/redeploy.

**Quick start (docker compose — recommended):**

```bash
docker compose up -d --build
```

This builds the image, starts the container, maps port 6100 (override with `PORT=8080
docker compose up -d`), and bind-mounts `./data` into the container so credentials and the
synced dataset persist across restarts and redeploys. Verified end-to-end on this repo: the
image builds, the container reports healthy, and a fresh container reusing an existing
`./data` volume picks the saved NTA credentials and cached tickets straight back up with no
re-entry needed.

**Plain `docker` (no compose):**

```bash
docker build -t ticket-hygiene-app .
docker run -d --name ticket-hygiene-app \
  -p 6100:6100 \
  -v "$(pwd)/data:/app/data" \
  --restart unless-stopped \
  ticket-hygiene-app
```

**Deploying to a Linux server:** copy the repo (or just build from git) onto the server,
then run either command above there. The `Dockerfile` runs as a non-root user, has a
`HEALTHCHECK` against `/api/health`, and needs no build tooling beyond `npm install` (no
native modules, no bundler) — a plain `node:20-alpine` image is enough. Nothing else in the
image needs internet access at runtime except outbound HTTPS to your Neutara Ticketing base
URL.

**First-time setup after deploying:** the container starts with no credentials configured
(unless you copy an existing `data/config.json` over) — open the app, go to **Settings**,
enter your Neutara Ticketing base URL and API key, save, and either wait for the first
background sync or click **Sync now**.

## Setting up Neutara Ticketing

1. In the app, open the **Settings** tab, find **Neutara Ticketing connection**.
2. Enter:
   - **API base URL** — defaults to `https://neutaraticketing.cftools.live/api`
   - **API key** — sent as `Authorization: Bearer <key>` (not a custom header, despite what
     an env var named `NTA_API_KEY` might suggest)
3. Click **Save**, then **Test connection** — this hits `GET /spaces` (the endpoint that
   actually enforces the key; `GET /stats` does not, so it can't be used to validate
   credentials) and reports the board count/names on success.
4. Click **Sync now** to pull the full ticket history immediately, or just wait for the
   background sync (kicks off once on server startup, then every 6 hours —
   `NTA_SYNC_INTERVAL_MS` in `server.js`). **A full sync takes several minutes** (timed at
   ~46s per 5,000 tickets against the ~29,000+ ticket dataset) and pulls everything each
   time — the API doesn't support an `updatedAfter`-style filter to make an incremental
   sync cheap.

Credentials are stored server-side in `config.json` (created on first save, gitignored,
never logged, never sent back to the browser in full). The synced dataset is cached in
`data/latest-nta-sync.json` (also gitignored) so it survives a restart without a fresh
several-minute pull.

Once at least one sync has completed, the Dashboard tab (backlog, SLA health, per-person
hygiene, reopened tickets, weekly reports) and the "Team tickets by individual" / Customer
Engineering / QA / Infra tabs (when their data-source toggle is set to "Live Neutara
Ticketing") all become live.

### Reference: the NTA API shape (reverse-engineered against the live service)

- Auth: `Authorization: Bearer <apiKey>` header.
- `GET /issues?page=&limit=&status=&spaceKey=&q=` → `{ issues, total, page, totalPages }`.
  Only `status`/`spaceKey`/`q` are honored server-side — no date or department filter is
  applied (confirmed: passing bogus filter names doesn't change `total`). `limit` up to at
  least 1000 works; `total` reflects the full filtered count even when `limit=1`.
- `GET /issues/:key` → single issue, looked up by its `key` (e.g. `L1BOAR-15317`), not by
  its internal `id`.
- `GET /spaces` → the "projects"/boards. **`issueCount` on this endpoint is unreliable** —
  it reported 204 for the `TESTIN` space when a direct count came back 29,438; don't use it
  for anything beyond a rough label.
- `GET /users` → the agent directory.
- `GET /stats` → `{ totalTickets, totalAgents, totalBoards }` — **does not require auth**,
  unlike every other endpoint above.
- Issue fields of note: `status` is `{id, name, category}` (not Jira's
  `statusCategory.key`), `priority` is a lowercase string (`lowest|low|medium|high|highest`),
  `description` is an HTML string (not Jira's ADF), and several fields that used to be Jira
  custom-field IDs are now plain native fields: `rootCause`, `fixDescription`,
  `customerName`, `clientName`, `combination`, `productType`. SLA is a simple `sla_breached`
  boolean, plus legacy carryover fields (`jira_sla_breached`, `jira_sla_due_at`,
  `jira_sla_start_at`) on tickets migrated over from Jira. **`current_department`** is the
  real team-routing signal — see "Team classification" below.
- `lib/ntaClient.js` implements all of the above; `routes/nta.js` exposes it at
  `/api/nta/*`; `test/test-nta-pagination.js` covers the pagination logic with a mocked
  `https` module.

## Team classification

Almost all tickets (29,438 of 29,487 at last check) live under a single space
(`TESTIN`/"CloudFuze Board"), so the space can't tell teams apart. The real signal is each
ticket's `current_department` field. Confirmed mapping (`shared/rules.js` →
`departmentToTeamKey`):

| `current_department` | Team |
|---|---|
| `Dev` | Customer Engineering (`eng`) |
| `Infra` | Infra (`infra`) |
| `QA` | QA (`qa`) |
| `Migration` | Migration ENT or SMB — split via the email roster (`shared/constants.js` → `TEAMS.ent`/`TEAMS.smb`), same mechanism the old Jira CFITS-project logic used. Unrostered assignees fall to `other`. |
| `Migration-Customer`, `Pre-Sales`, `null`/unknown | `other` (not yet mapped to a team) |

`lib/ntaMapper.js` applies this during sync, producing the same pseudo-issue shape
`lib/excelParser.js` already used (`{ key, teamKey, fields: {...}, frb, rb }`), so
`shared/logic.js`'s team-tab/hygiene-scoring functions work identically against either
source.

## Using the Excel upload

In **Settings → Excel upload**, choose a `.xlsx`/`.xls`/`.xlsm` file and click **Upload &
parse**. Expected columns (by header name, any order):

```
Issue Type, Key, Summary, Assignee, Reporter, Components, Combination, Priority, Status,
Resolution, Created, Updated, Due date, First Response SLA Breach, Resolution SLA Breach
```

Each row is converted into the same pseudo-issue shape used internally
(`{ key, teamKey, fields: { summary, status, assignee, reporter, project, created, updated,
resolutiondate }, frb, rb }`), where `frb`/`rb` are the parsed First Response / Resolution
SLA breach flags. The **Key** column's prefix decides the team:

| Key prefix | Team |
|---|---|
| `L2B`, `L3B` | Customer Engineering |
| `IN` | Infra |
| `QA` | QA |
| `CFITS` | Kept in the dataset, but **not** attributed to a team — see limitation below |
| anything else | Kept in the dataset, not attributed to a team |

This is a legacy Jira-export column layout (this feature predates the Neutara Ticketing
migration) — the **Assignee** column is a free-text display name (no email in the sheet),
so it's matched back to a confirmed team-roster email by normalizing both the sheet name
and each roster email's derived name (stripping punctuation/case) and comparing them. If a
row's assignee doesn't match anyone on that team's confirmed roster, the row is still kept
in the full dataset (visible via `GET /api/data/current`) but is excluded from team-tab
tables, the same rule the NTA sync path uses for its own unattributed ("other") tickets.

The parsed dataset is held in memory and also written to `data/latest-upload.json` so it
survives a server restart (this file is gitignored — it's your data, not app code).

## Per-section data source

The Customer Engineering / QA / Infra tabs, and the "Team tickets by individual" tab, each
have their own **Data source: Live Neutara Ticketing / Uploaded Excel** dropdown — pick
independently per tab. The Excel export doesn't carry description/comments/RCA/Fix
Description, so sections needing those hide or disable those specific checks when the
source is set to "Uploaded Excel," with a short note explaining why.

The Dashboard tab's sections (backlog counts, SLA health, per-person hygiene, reopened
tickets, weekly reports) are Live-NTA-only, since none of that data is present in the Excel
schema at all.

## Migration notes (Jira → Neutara Ticketing)

This app originally ran entirely on Jira Cloud's REST API (JQL queries built client-side,
proxied server-side). That's been fully removed — `lib/jiraClient.js`, `routes/jira.js`,
`shared/jql.js`, the Jira Settings panel, and every JQL-string-building call site are gone.
What replaced them:

- **No query language.** NTA only filters by `status`/`spaceKey`/`q` server-side, so every
  metric that used to be a JQL string (backlog counts, SLA health, reopened tickets, weekly
  reports) is now plain JavaScript array filtering over the synced dataset
  (`public/js/dashboard.js`).
- **"Reopened" is current-status-based, not changelog-based.** The old JQL used "status
  changed to Reopened after X" (real changelog history); NTA doesn't expose per-issue
  status-change history yet, so this now checks whether a ticket's **current** status is
  "Reopened." A ticket reopened and then re-closed between syncs won't show up.
- **"Marked duplicate" was dropped** — NTA has no `resolution` field equivalent, so there
  was nothing to check.
- **Closing-comment-quality and screenshot/attachment-evidence checks currently show "no
  data tracked"** for every ticket — `comments`/`attachments` arrays were empty on every
  ticket sampled while building this. The fields are real and wired up
  (`lib/ntaMapper.js`/`shared/logic.js`'s `classifyNtaTicket`); they'll start reporting
  real results once the ticketing tool actually has comment/attachment data.
- **The ticket-detail link (`browseUrl` in `public/js/util.js`) is an unverified guess** at
  Neutara Ticketing's web UI route (`{baseUrl}/tickets/{key}`) — correct it once the real
  route is known.
- **The synced dataset looked like demo/seed data** at the time of this migration (every
  user's `organizationId` was `"org_demo"`, every ticket's `createdAt` was within the last
  few days despite ~29,000+ historical-looking ticket numbers) — worth confirming this is
  now production data before trusting hygiene numbers for real reporting.

## Note on Excel-upload team-attribution accuracy

The `All Tickets.xlsx`-shaped export only has a free-text display name in its Assignee
column, so `lib/excelParser.js` has to reverse-match that name against each team's
confirmed roster (exact normalized match, then a token-subset fallback for name variants
like "Raviteja" vs. the roster's "Bala Raviteja"). Names it can't confidently resolve —
including legitimate cross-team assignments — are correctly left unattributed rather than
guessed at. Tested against a real 2,614-row sample: about 77% of rows resolve to a
confirmed team roster member (`unmatchedRosterCount` in the upload response tells you
exactly how many didn't, per upload).

## Known limitations

- **Migration ENT vs SMB can't be split from the Excel schema.** Both teams' tickets have
  no distinguishing column in the sheet beyond the assignee name, so attribution depends
  entirely on roster-name matching (see above) — the live NTA path has the same
  ENT/SMB-via-roster dependency for its `Migration` department (see "Team classification").
  **If you control either export/tool's schema,** adding a `Segment`/`Sub-team` column
  would let this be split deterministically instead.
- **Charts** (open-tickets-by-priority / by-age bar charts) were left out to keep the app
  dependency-free on the frontend (no bundler, no CDN chart library) — the same underlying
  counts are still shown as cards.
- **DOCX/XLSX per-person report downloads** (scorecards, ticket audits) are not
  implemented — the underlying scoring functions (`computePersonFactorScores`,
  `computeTicketScore`, etc.) are used on-screen, but no document-export feature was built.
- The **automated "save to a connected folder every Monday at noon IST"** behavior some
  earlier notes mentioned was specific to a different hosting environment and has no
  equivalent here — "This week's reports" is available on-demand only.
- See "Migration notes" above for the NTA-specific limitations (reopened detection,
  dropped duplicate-check, empty comments/attachments, unverified ticket-link URL).

## Project layout

```
jira-hygiene-app/
  server.js               Express app entry point + NTA background-sync scheduler
  Dockerfile              node:20-alpine, non-root user, HEALTHCHECK against /api/health
  docker-compose.yml       builds + runs the app, bind-mounts ./data for persistence
  .dockerignore
  routes/
    nta.js                  POST /api/nta/search, /count, /sync; GET /api/nta/spaces, /users,
                             /stats, /test-connection, /sync-status, /current
    data.js                 POST /api/data/upload, GET /api/data/current (Excel)
    config.js                GET/POST /api/config (nta block: baseUrl/apiKey)
  lib/
    ntaClient.js             Neutara Ticketing REST client (Bearer auth, page/limit pagination)
    ntaMapper.js              raw NTA issue -> pseudo-issue shape + department->team classification
    ntaSync.js                full-sync orchestration (fetch all, map, cache, status tracking)
    ntaStore.js               in-memory + data/latest-nta-sync.json persistence
    configStore.js           config.json read/write + secret masking
    excelParser.js           .xlsx -> pseudo-issue schema conversion
    dataStore.js              in-memory + data/latest-upload.json persistence
  shared/                   Ported business logic (Node + browser, no duplication)
    constants.js              rosters, status names, thresholds, static tab content
    rules.js                  classify(email)/retryMatch(summary)/departmentToTeamKey()
    logic.js                  scoring/classification functions (classifyNtaTicket, classifyFileTicket, computeHygiene, ...)
  public/                  Frontend (plain HTML/CSS/vanilla JS, no build step)
  data/                    Gitignored — holds config.json, latest-upload.json,
                           latest-nta-sync.json; the one directory to persist/volume-mount
  test/
    test-nta-pagination.js    Mocked-response unit test for ntaClient's pagination logic
    test-nta-mapper.js        Unit test for the department->team classification
```

## Security notes

- Everything under `data/` (`config.json`, `latest-upload.json`, `latest-nta-sync.json`) is
  gitignored — don't commit it. This is also the one directory to bind-mount/volume when
  running in Docker.
- The Neutara Ticketing API key is only ever read server-side (`lib/configStore.js`,
  `lib/ntaClient.js`); no route or log statement in this app prints it.
- `npm audit` reports one high-severity advisory in the `xlsx` (SheetJS) package with no
  fixed release currently published to npm (prototype pollution / ReDoS, both triggered by
  parsing a malicious spreadsheet). Only upload `.xlsx` files you trust; this app only parses
  files a user explicitly uploads via Settings, it never fetches or parses a spreadsheet from
  an untrusted or remote source.
