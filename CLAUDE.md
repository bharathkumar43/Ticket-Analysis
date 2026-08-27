# Ticket Hygiene Dashboard — Project Standards

Standalone Node.js + Express app for team-segregated backlog health, per-person hygiene, and
Shift Lead assignment performance, sourced from Neutara Ticketing (NTA) — an internal
ticketing tool — plus optional uploaded Excel exports. See `README.md` for the full NTA API
shape, sync mechanics, and Docker deployment instructions; this file covers standards and the
multi-agent (GStack) workflow rule.

## Tech Stack

- **Runtime**: Node.js (`node:20-alpine` in Docker), plain CommonJS (`require`/`module.exports`)
  — no TypeScript, no bundler, no build step.
- **Server**: Express 4 (`server.js`, routes under `routes/`).
- **Frontend**: Vanilla JS + hand-written DOM/innerHTML rendering (`public/js/*.js`), no
  framework (no React/Vue), plain CSS (`public/css/styles.css`), single `public/index.html`
  shell with tab-based navigation.
- **Data storage**: No database. Server-side JSON files under `data/` (gitignored):
  `config.json` (NTA credentials), `latest-nta-sync.json` (cached ticket dataset). Some
  browser-only state (Leader Metrics tab) lives in `localStorage`, not the server.
- **External dependency**: Neutara Ticketing REST API (`lib/ntaClient.js`), proxied
  server-side only — the browser never holds the API key.
- **Testing**: Plain Node scripts under `test/`, run via `npm test`
  (`node test/test-nta-pagination.js && node test/test-nta-mapper.js`). No test framework
  (no Jest/Mocha) — tests use Node's built-in `assert`.
- **Deployment**: Docker (`Dockerfile`, `docker-compose.yml`), non-root user, `HEALTHCHECK`
  against `/api/health`. No CI/CD pipeline configured in this repo (no `.github/workflows`) —
  deploys are manual (`docker compose up -d --build` on the target host). **Pushing/merging to
  `main` does NOT auto-deploy anything today.** If that ever changes (a CI workflow is added
  that deploys on push to `main`), this file and `.claude/workflows/deployment.yaml` must be
  updated to say so explicitly, since merge-to-main and production-deploy would become the
  same action at that point.

## Directory Structure

```
server.js              — Express app entry point, mounts routes, background NTA sync scheduler
routes/                — Express route modules (nta.js, and others as added)
lib/                    — Server-side business logic: ntaClient.js (raw NTA API calls),
                          ntaMapper.js (raw NTA issue -> internal pseudo-issue shape),
                          ntaStore.js (persisted sync cache), ntaSync.js (scheduler),
                          ntaActivityCache.js (per-ticket activity cache), configStore.js,
                          devTransferCheck.js (Shift Lead full-scan background job),
                          excelParser.js (legacy Excel-upload data source)
shared/                 — Logic shared between server and any future consumers: rules.js
                          (department -> team mapping), logic.js (hygiene scoring, SLA rollups)
public/                 — Static frontend
  index.html            — single-page shell, tab navigation
  js/                   — one file per tab/feature (dashboard.js, shiftlead.js,
                          leadermetrics.js, teamtickets.js, main.js, api.js, util.js, ...)
  css/styles.css         — all styling
data/                   — gitignored runtime state (config.json, latest-nta-sync.json)
test/                   — plain Node assert-based test scripts
.claude/agents/         — GStack specialist agent definitions (see below)
.claude/workflows/      — GStack pipeline definitions (see below)
```

## Naming Conventions

- Shift Lead tab functions/vars are prefixed `sl` (e.g. `slComputeLeadStats`,
  `slFmtMinutes`) to avoid collisions with other tabs' globals — all frontend JS shares one
  global scope (no modules/bundler). Follow the same pattern for any new tab: a short
  lowercase prefix on every function/variable that isn't already unambiguous.
- Server-side NTA field names stay close to the raw API (`sla_breached`, `current_department`)
  in `lib/ntaClient.js`/`lib/ntaMapper.js`'s raw-facing code; once mapped into the internal
  pseudo-issue shape (`lib/ntaMapper.js`'s `mapIssue`), use the internal names (`rb`, `frb`,
  `department`, `fields.*`) consistently — don't reintroduce raw NTA field names past the
  mapper boundary.
- Comments should explain *why*, especially for anything reverse-engineered against the live
  NTA API (quirks, unreliable fields, timing) — see the existing comment density in
  `lib/ntaClient.js` and `public/js/shiftlead.js` as the bar to match.

## Security Standards

- The NTA API key never reaches the browser. It lives only in `data/config.json` (gitignored,
  server-side) and is attached to outbound NTA requests in `lib/ntaClient.js`. Never add a
  code path that returns the raw key to a frontend response, logs it, or embeds it in a
  downloadable export.
- `data/` (config + synced ticket cache) must stay gitignored — it can contain customer names,
  ticket content, and the API key. Never commit anything under `data/`.
- Any new Express route that touches NTA config or triggers a sync must use the existing
  `requireConfig` guard pattern (see `routes/nta.js`) rather than assuming config is present.
- No secrets in agent files, workflow files, or committed docs — reference `data/config.json`
  by path, never by value.

## Testing Standards

- New server-side logic (mapping, rules, scoring) gets a plain Node `assert`-based test under
  `test/`, following the existing style in `test/test-nta-mapper.js`. Wire it into `npm test`.
- Frontend JS has no automated test harness today — verify manually via the running app (see
  the `run` skill / `npm start` + browser) for any UI-facing change. Note this limitation
  explicitly in QA reports rather than implying automated coverage that doesn't exist.
- Before considering any JS change done, run `node --check <file>` at minimum to catch syntax
  errors — this repo has no linter configured.

## Git Workflow

- `main` is the default/production branch. `joshi` is an existing personal working branch.
- Never commit directly to `main` without explicit user confirmation of the target branch (see
  Workflow Selection below) — branch first for any non-trivial change unless told otherwise.
- Conventional commit messages (`fix:`, `feat:`, `chore:`, etc.) where practical.
- Never use `--force` push, `git rebase -i`, or skip hooks (`--no-verify`) unless the user
  explicitly asks.

## Hard Rules

**Never:**
- Commit, merge, or deploy without explicit user confirmation (see gates below).
- Commit anything under `data/`, `.env`, or any file containing the NTA API key.
- Assume merge-to-main triggers a deploy — today it does not; state this plainly if asked.
- Let `devops-engineer` touch Docker/deploy config without an explicit user go-ahead to deploy.
- Silently change the shape of the internal pseudo-issue object (`lib/ntaMapper.js`'s output)
  without checking every consumer in `shared/logic.js`, `shared/rules.js`, and `public/js/*`.

**Always:**
- State which flow was used (GStack workflow vs. direct edit) when reporting completed work.
- Ask before any commit, merge, or deploy — see the three-gate pattern below.
- Prefer editing existing files over creating new ones; prefer the smallest correct diff.

---

## 🔀 Workflow Selection (GStack vs Direct)

**Default rule:** the size and risk of a task decides which flow Claude uses.

### Use a GStack workflow (`.claude/workflows/`) by default for:
- New features (any size) → `new-feature` workflow
- Bug fixes → `bug-fix` workflow
- Deployments → `deployment` workflow
- Any change touching: NTA credential handling (`configStore.js`, `routes/nta.js` config
  endpoints), the ticket mapping/scoring logic (`lib/ntaMapper.js`, `shared/logic.js`,
  `shared/rules.js`), the Shift Lead SLA/cross-assignment computations
  (`public/js/shiftlead.js`), Docker/deploy config (`Dockerfile`, `docker-compose.yml`,
  `docker-entrypoint.sh`), or anything reading/writing `data/`

### Direct (normal) flow is allowed by default for:
- Trivial single-file cosmetic edits (UI text, styling tweaks in `public/css/styles.css`)
- Documentation typos and comment fixes
- Answering questions / investigations with no code change
- Read-only data lookups (e.g. "what's Abhinandan's avg assign time") that don't touch code

### User overrides (always win over the defaults):
- Prefix a request with **"use gstack"** → run the full GStack workflow regardless of size
- Prefix a request with **"quick fix"** or **"direct"** → skip the workflow and edit directly

### Always (regardless of flow):
- Borderline case? Ask the user which flow to use before starting.
- Ask for explicit user confirmation before any commit, merge, or deploy. Commit gate is two
  steps: (1) whether to commit, (2) which branch — current, `main`, `joshi`, or new — never
  assume. Deploy gate is three steps: (1) whether to deploy at all, (2) which branch to deploy
  from, (3) target — the docker-compose host this repo already documents (there is currently
  only one documented target; ask the user to confirm if that's still accurate). If no deploy,
  stop after the commit.
- **Merge-to-main does NOT currently auto-deploy** (no CI/CD pipeline is configured in this
  repo). State this plainly whenever a deploy gate comes up, and re-verify it's still true
  before assuming it (a CI workflow could be added later without this file being updated).
  If it's ever wired to auto-deploy, merge-to-main and production-deploy become ONE action —
  never merge to main without an explicit production-deploy approval at that point.
- State which flow was used when reporting completed work.
