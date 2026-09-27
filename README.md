# Study OS — ثانوية عامة study operating system

A personal study-management web app for the Egyptian Thanaweya Amma year. It helps with deciding
what to study today, starting even when motivation is low, focusing with a Pomodoro timer, logging
results, revising on a schedule, learning from mistakes, and seeing honest progress. Everything is
configurable, and nothing about the curriculum or exam dates is hard-coded.

The core loop is **Dashboard → Today → Start → Phone Away → Focus → Pomodoro → log results →
mistakes / revision → back to Today → next task**.

- **Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · **shadcn/ui** (Radix) · Prisma 6 · Zod 4 · date-fns · Zustand · Lucide · Sonner · KaTeX · Vitest
- **Database:** SQLite by default (zero setup). PostgreSQL is supported by changing one line (see [DATABASE.md](DATABASE.md)).
- **Mode:** local single-user. Every row is scoped to a user id, so authentication can be added later.

More detail: [ARCHITECTURE.md](ARCHITECTURE.md) · [DATABASE.md](DATABASE.md) · [FEATURES.md](FEATURES.md)

---

## Quick start

Requirements: Node.js 20.19+ (tested on Node 24) and npm.

```bash
npm install          # also runs `prisma generate`
cp .env.example .env # SQLite by default: DATABASE_URL="file:./dev.db"
npx prisma migrate dev   # creates prisma/dev.db and applies migrations
npm run dev          # http://localhost:3000
```

On first launch a 4-step setup runs (you, subjects, routine, current progress) and then your plan is
generated on the Today page. Everything can be changed later in Settings.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server (Turbopack) |
| `npm run build` | `prisma migrate deploy` + production build |
| `npm run build:app` | Production build only (no migrations) |
| `npm start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript + React Compiler rules) |
| `npm test` | Vitest unit tests (run in the `Africa/Cairo` timezone to exercise DST) |
| `npm run check` | typecheck + lint + tests |
| `npm run db:migrate` | Create/apply a migration in development |
| `npm run db:deploy` | Apply migrations (production) |
| `npm run db:studio` | Browse the database in Prisma Studio |

## Environment variables

| Variable | Required | Example | Notes |
|---|---|---|---|
| `DATABASE_URL` | yes | `file:./dev.db` | SQLite path (relative to `prisma/`) or a PostgreSQL URL |

No other secrets are used. `.env` is git-ignored; `.env.example` is committed.

## Database setup & migrations

- **SQLite (default):** `npx prisma migrate dev` creates `prisma/dev.db`. Back it up by copying the file, or use Settings → Data → Download backup.
- **PostgreSQL:** set `provider = "postgresql"` in `prisma/schema.prisma`, set `DATABASE_URL`, remove `prisma/migrations`, and run `npx prisma migrate dev --name init`. See [DATABASE.md](DATABASE.md).
- After changing `schema.prisma`, run `npm run db:migrate -- --name <change>`.

## Production build & deployment

```bash
npm run build   # applies pending migrations, then builds
npm start       # serves on port 3000 (PORT=xxxx to change)
```

- **Your own machine or a VPS (simplest):** keep SQLite, run `npm run build && npm start` behind any reverse proxy, and back up `prisma/dev.db`.
- **Vercel / serverless:** SQLite files don't persist on serverless platforms, so use PostgreSQL (Neon, Supabase, Railway, …). Switch the provider as above, set `DATABASE_URL` in the host's environment, and use `npm run build` as the build command so migrations run on deploy.
- **Install as an app (PWA):** in production, open the site in Chrome, Edge or Android and use *Install app*. The service worker only registers in production builds.

## How it works (short)

### Data flow
All of the single user's data loads once from `/api/bootstrap` into an in-memory store. Mutations
apply optimistically, then go through a persistent queue and are sent in order to `/api/sync`.
The server re-validates everything with the same Zod schemas. A snapshot and the queue are kept in
IndexedDB, so the app opens offline and syncs once the connection returns. Failed saves always
show *“Your data could not be saved.”*, and the view resyncs from the server. Details are in
[ARCHITECTURE.md](ARCHITECTURE.md).

### Weekly plan and calendar
The routine is stored once, in Settings (`weeklyPlan`), and `src/lib/domain/weekly.ts` (pure and
unit-tested) turns it into days:

- each weekday lists blocks (a subject, weekly revision or catch-up), a preferred start time (or
  automatic placement inside your study window, around meals and breaks) and a duration
- the calendar renders future weeks straight from the routine; only the next two weeks, and any
  block you touch, are stored
- a one-off change (move, skip, day off, edit) is stored for that date and never changes the routine
- study blocks continue from your curriculum progress
- due revisions, exams and tasks are added from their own tables

Missed work is never piled onto tomorrow. Instead you choose one of:

- **Reschedule** to the next slot that fits within your limits
- **Move to catch-up**, which puts it in the backlog, placed on the catch-up day first
- **Skip**
- **Complete now**

### Timer
`src/lib/domain/timer.ts` is a timestamp-based state machine. Remaining time is always computed
from `now`, so it stays exact when the tab is hidden, throttled or reloaded; the state is
persisted. When the page comes back, `advance()` closes every phase that ended in the meantime
at its exact end time. A small Web Worker wakes the page at phase end, so alerts fire on time in
background tabs. Every phase is logged as a `PomodoroSession`.

## Project layout

```
prisma/                 schema + migrations
public/sw.js            service worker (offline shell)
src/app/(app)/…         pages: dashboard, today, study, subjects, lessons, revision, mistakes, exams, settings
src/app/api/…           bootstrap, sync, export, import, health
src/components/         ui kit, shell (sidebar, palette, engines), forms, study widgets, charts
src/lib/domain/         pure logic: weekly plan, next-slot search, timer, revision, analytics, metrics, dates, csv, import (+ tests)
src/lib/schemas/        Zod schemas: entities, settings, backup (shared by client and server)
src/lib/store/          data store + sync queue, focus/timer store, ui, toasts, confirm
src/server/             Prisma client, current user, repository
```

## Known limitations (stated honestly)

- **Reminders fire only while the app is open in a tab.** There is no push server. Browser notifications are used when permitted; otherwise you get in-app messages.
- **Offline:** pages you haven't opened since installing may not be available offline. Offline changes sync automatically, but two tabs editing the same item offline resolve as last write wins.
- **Arabic:** full RTL layout, with Arabic translation for navigation and core screens; untranslated strings fall back to English.
- **No drag-and-drop:** blocks are moved with Edit / Reschedule, which works the same on every device.
- **Authentication** isn't implemented yet (single local user). See ARCHITECTURE.md → *Adding authentication*.
- Exam answers are self-marked. The app doesn't store answer keys.

## Importing the curriculum

Subjects → **Import** has a one-click button for the bundled *Third Secondary · Scientific Math 2026/27* dataset (`public/curriculum/`). It also accepts your own JSON or CSV files, including the same `subjects → sections → units → lessons` format. Sections become units and dataset units become chapters. Subjects are matched to yours by name (Math ↔ Mathematics), and re-importing never creates duplicates.
