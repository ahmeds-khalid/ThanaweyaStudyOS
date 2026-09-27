# Database

Prisma ORM with a normalized schema (`prisma/schema.prisma`). The schema avoids provider-specific
types, so the same file works for **SQLite** (the default) and **PostgreSQL**.

> Some tables (question sets, goals, calendar events, sleep entries, daily/weekly reviews, roadmap phases) are no longer used by the interface. They are kept so older backups still restore and features can return.

## Conventions

- **Every row belongs to a `User`** (`userId`, cascade delete). The app currently uses one fixed local user (`local-user`).
- **IDs are client-generated UUIDs.** This lets the client create rows offline and reference them immediately. Creates are upserts, so retried syncs are idempotent.
- **Timestamps:** `createdAt`, `updatedAt` (`@updatedAt`) and `deletedAt` for **soft deletion**. Normal use never hard-deletes; only "Import → Replace all", which requires typed confirmation, removes rows.
- **Enumerations are strings** validated by Zod (`src/lib/schemas/entities.ts`). Keeping them out of the database makes the schema portable, and the valid values are listed in one place.
- **Calendar days** are stored as `YYYY-MM-DD` strings and **clock times** as `HH:mm`, both in local time. Instants (session start, completion) are `DateTime`. This keeps "which day did this happen" DST-safe.
- **JSON columns** hold small nested lists that are always read with their parent: lesson topics, task tags and subtasks, mistake tags and review history, exam answers, goal milestones, event weekdays, review summaries.
- **`isDemo`** marks optional demo data so it can be shown with a badge and removed without touching real data.

## Entities

| Model | Purpose | Key relations |
|---|---|---|
| `User` | Owner of all data | 1–1 `Settings`, 1–n everything |
| `Settings` | One JSON document per user (validated by `settingsSchema`) | `User` |
| `Subject` | Name, icon, colour, priority, weekly sessions/hours, difficulty, importance, enabled/archived, order, exam date, manual progress, pinned chapter | units, chapters, lessons, … |
| `CurriculumUnit` | Unit inside a subject | `Subject`, chapters |
| `Chapter` | Chapter inside a unit | `Subject`, `CurriculumUnit`, lessons |
| `Lesson` | Title, description, estimate, status, workflow stage, difficulty, teacher, video URL, notes, **topics (JSON)**, completion, started/completed, explanation & practice minutes, questions, test score | `Subject`, `Chapter` |
| `StudySession` | A timed or logged session: activity, planned/actual/focused minutes, interruptions, phone checks, pomodoros, questions, ratings, notes, Start Small flags, start delay | `Subject?`, `Lesson?`, block id |
| `PomodoroSession` | One focus or break phase: planned vs. actual seconds, completed or cut short | session id |
| `ScheduleBlock` | A planned block on a date: kind (study/revision/catch-up/…), activity, time, duration, status, source (generated/manual/backlog), priority override, locked | `Subject?`, `Lesson?` |
| `BacklogItem` | Missed or unfinished work waiting for catch-up: estimate, importance, deadline, scheduled block | `Subject?`, `Lesson?` |
| `Task` | Title, description, priority, estimate, due date, recurrence, status, tags, subtasks, notes | `Subject?`, `Lesson?` |
| `Revision` | Scheduled review: type, date, duration, status, rating, ladder step | `Subject?`, `Lesson?`, `Mistake?` |
| `Mistake` | Question, source, type, explanation, correct method, severity, tags, image (compressed data URL), next review, step, review history, resolved | `Subject?`, `Lesson?` |
| `QuestionSet` | Total/attempted/correct/wrong/skipped, total minutes, date | `Subject?`, `Lesson?`, session id |
| `Exam` | Name, date, duration, marks, mode, pause rule, answers (JSON), started/submitted, time used | `Subject?` |
| `Goal` | Type, target/current/unit, deadline, tracking mode (manual or auto), milestones (JSON), status | `Subject?` |
| `CalendarEvent` | Gym / personal / free-time events, weekly recurrence, fixed or not | — |
| `Thought` | Parked thought: status, snooze date, linked session/task | — |
| `SleepEntry` | Bedtime, wake time, duration, quality | — |
| `DailyReview` / `WeeklyReview` | Answers plus a numeric summary snapshot (JSON) | — |
| `RoadmapPhase` | Year phases with dates, colour and optional curriculum target | — |

Relations to optional parents use `onDelete: SetNull`. Curriculum children cascade with their
parent, which only matters for hard deletes during a *Replace all* import.

## Migrations

```bash
npx prisma migrate dev --name <change>   # development: create + apply
npx prisma migrate deploy                # production: apply pending (run by `npm run build`)
npx prisma studio                        # inspect data
```

## Switching to PostgreSQL

1. In `prisma/schema.prisma`, set `provider = "postgresql"`.
2. Set `DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/study_os?schema=public"` in `.env`, or in your host's settings.
3. Delete `prisma/migrations/`, because migration SQL is provider-specific, then run `npx prisma migrate dev --name init`.
4. To move existing data, use **Settings → Data → Download backup** before switching, then **Import → Replace all** afterwards.

## Backups

- **JSON backup:** Settings → Data → *Download backup* (`GET /api/export`). It includes every entity and your settings, and is validated on import (`src/lib/schemas/backup.ts`).
- **CSV:** sessions, lessons, tasks, revisions, mistakes, exams and question sets, for spreadsheets.
- **SQLite file:** copy `prisma/dev.db` while the server is stopped.
