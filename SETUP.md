# Getting Started

## Prerequisites
- Node.js 18+
- Docker Desktop (for Postgres)

## 1. Start Postgres
```bash
docker compose up -d
```

## 2. Backend setup
```bash
cd backend
npm install
npx prisma migrate dev --name init
npx prisma db seed
npm run dev
```
Backend runs at http://localhost:3001

Default login: `admin` / `changeme` (set via `APP_USERNAME` / `APP_PASSWORD` in `.env`)

## 3. Frontend setup
```bash
cd frontend
npm install
npm run dev
```
Frontend runs at http://localhost:5173

## 4. Import existing data (optional)
```bash
cd backend
npm run import -- --tickets path/to/tickets.csv --projects-active path/to/active.csv --projects-completed path/to/completed.csv
```
CSV column names are matched case-insensitively against the workbook column names.

## 5. Connect Jira (optional)
Edit `backend/.env`:
```
JIRA_BASE_URL=https://yourco.atlassian.net
JIRA_EMAIL=you@example.com
JIRA_API_TOKEN=your-token
JIRA_JQL=project = MIG ORDER BY updated DESC
```
Then use the Jira Sync screen in the app, or POST `/api/jira/sync`.

## 6. Run backend tests
```bash
cd backend
npm test
```

## Environment variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Secret for JWT signing |
| `APP_USERNAME` / `APP_PASSWORD` | Login credentials |
| `JIRA_BASE_URL` | Jira Cloud base URL |
| `JIRA_EMAIL` | Jira auth email |
| `JIRA_API_TOKEN` | Jira API token (never committed) |
| `JIRA_JQL` | JQL filter for sync |
| `SYNC_CRON` | Cron schedule for auto-sync |
| `JIRA_FIELD_*` | Custom field IDs (environment-specific) |
