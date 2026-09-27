# Architecture

## Goals that shaped the design

1. **The critical loop must be instant and reliable:** Today → Start → Focus → Log → Next. That means no spinners between steps, and a timer that is never wrong.
2. **Offline-tolerant.** The timer and today's plan keep working without a connection.
3. **Settings are real.** Every setting feeds a pure function that is also unit-tested.
4. **Simple.** One Next.js app, one database, no extra services.

## Layers

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Pages (src/app/(app)/*)  — client components, rendered after data loads   │
│   use hooks: useRows / useSettings / useNow / useFocus / useT             │
├──────────────────────────────────────────────────────────────────────────┤
│ Actions (src/lib/actions.ts) — multi-step user intents                    │
│   computePlan/applyPlan, rescheduleBlock, moveToCatchUp, completeRevision │
├───────────────────────────────┬──────────────────────────────────────────┤
│ Domain (src/lib/domain/*)     │ Stores (src/lib/store/*)                  │
│  pure, deterministic, tested  │  data.ts  – tables + sync queue + cache   │
│  scheduler, timer, revision,  │  focus.ts – global timer/session (persist)│
│  analytics, timeline, metrics │  ui.ts, toast.ts, confirm.ts              │
├───────────────────────────────┴──────────────────────────────────────────┤
│ Schemas (src/lib/schemas/*) — Zod, shared by client + server              │
├──────────────────────────────────────────────────────────────────────────┤
│ API (src/app/api/*) → Repository (src/server/repo.ts) → Prisma → DB       │
└──────────────────────────────────────────────────────────────────────────┘
```

### Why local-first on top of a real database

The data for one student is small: even a full year is a few thousand rows. It all loads once
(`GET /api/bootstrap`) into a Zustand store. After that:

- every page renders immediately from memory, and all computation (planning, analytics,
  priorities) runs client-side as pure functions over plain arrays;
- mutations (`db.create/update/remove/restore/updateSettings`) validate with Zod, apply
  optimistically, and append to a **persistent queue**;
- the queue is flushed to `POST /api/sync` in order, up to 100 ops per batch. The server
  re-validates each op, scopes it to the current user, and applies it. Creates are **upserts**,
  so retrying after a lost response is safe;
- on network or 5xx failure the queue is kept (IndexedDB) and retried with exponential backoff and
  on the `online` event. On a 4xx or a per-op validation failure the user sees
  *“Your data could not be saved.”* and the store reloads from the server, so the UI never shows
  unsaved data as saved;
- a snapshot of all tables and settings is written to IndexedDB (debounced), so the next launch
  renders instantly, even offline, and then reconciles with the server. Queued ops are re-applied
  on top of the fresh server copy.

IDs are client-generated UUIDs, so rows can be created offline and referenced immediately.
Deletion is soft (`deletedAt`), and every delete toast has an **Undo** that restores the row.

### The focus timer

- `domain/timer.ts` is a state machine over timestamps: `segmentStartedAt`, `elapsedBeforeMs`
  (time before pauses), `phaseStartedAt`, `completedFocus` and `focusedMsBefore`. It never
  decrements a counter.
- `advance(state, now, cfg)` closes every phase that has ended by `now` at its **exact** end time
  and returns them, so a tab that slept for an hour catches up correctly (covered by unit tests).
- `store/focus.ts` holds one global timer, persisted to `localStorage` so it survives reloads. It
  also holds the session lifecycle: `idle → phone → running → (starter_check) → review`.
  Finishing writes the measured `actualMinutes`, `focusedMinutes` and pomodoro count to the
  session **before** the review form, so nothing is lost if the tab closes.
- `components/shell/engines.tsx › TimerEngine` ticks every 500 ms while running. The tick only
  re-derives state; it never keeps time itself. A tiny Blob Web Worker schedules a wake-up at the
  exact phase end, because background tabs throttle `setInterval`. Tab visibility and focus also
  trigger a tick.
- A study session ends automatically when its planned wall time (focus plus breaks, excluding
  pauses) is used up.

### The weekly plan

`settings.weeklyPlan` holds the recurring routine: for each weekday (0 = Sunday) an `off` flag, a
`catchUp` flag and a list of slots `{ id, kind: study | revision | catchup, subjectId, start | null, durationMinutes }`.
`domain/weekly.ts` is the whole planner, and it is pure:

1. **`defaultWeeklyPlan`** builds the first routine from the subjects: higher priority first, one
   session per subject per weekday, sessions spread across the week, capped at `blocksPerDay`
   (the lowest-priority sessions are dropped first and reported), plus weekly revision and catch-up on the catch-up day.
2. **`expandDay(settings, date)`** returns what the routine wants on a date. `placeSlots` gives
   slots without a preferred time consecutive positions from the start of the study window, leaving
   the break between them and stepping around meals and fixed-time slots.
3. **Occurrence ids.** A stored block generated from the routine has the id `wk:<slotId>:<original date>`.
   Because the id keeps the original date, the generator can tell that an occurrence already
   exists even after it was moved to another date, skipped or completed, so it is never generated again.
   That is what makes a *specific-date override* possible without touching the routine.
4. **`occurrencesBetween`** merges stored blocks with the routine's not-yet-stored blocks (marked
   `virtual`). Calendar, Today and the day view all read this, so the future is drawn without storing it,
   and Today is populated before anything has been saved. Days already over show only what really happened.
5. **`syncWeeklyPlan`** (`actions.ts`, run by `AutoPlanner`) stores the next 14 days: it creates what is
   missing, updates untouched blocks whose slot changed, hides (never deletes) untouched blocks the
   routine no longer contains so they can return, and links each study block to the lesson it continues
   with (first lesson in curriculum order that is neither completed nor planned for an earlier block).
   Anything the student started, completed, skipped, edited or moved has `source` other than
   `generated` or a non-`upcoming` status and is left alone. It is idempotent and only writes differences.
6. **Days off** are dates in `settings.study.daysOff`; `endsOn` stops the routine after a date.
7. **Missed work** goes through `findNextSlot` (still in `domain/scheduler.ts`), which respects sleep,
   meals, breaks between blocks and the maximum daily load.

Editing the routine (`saveWeeklyPlan`) also mirrors study days and the catch-up day into
`settings.study`, which the slot search reads.

### Settings

`schemas/settings.ts` is one versioned document validated by Zod. `parseSettings()` deep-merges
stored values over defaults and repairs only an invalid section, so a bad value never wipes other
preferences. It is mirrored to `localStorage` (theme, direction, density, motion) for a pre-paint
script, which avoids a theme or direction flash.

### i18n & RTL

`lib/i18n` provides `useT()` with an English source dictionary and Arabic translations; missing
Arabic keys fall back to English. `<html dir>` switches to `rtl`, and the UI uses logical
properties throughout (`ms-/me-/ps-/pe-/start-/end-`, `rtl:rotate-180` on directional icons).
Arabic uses IBM Plex Sans Arabic.

### Accessibility

- Dialogs use the native `<dialog>`, which provides the focus trap and Esc.
- Labels come through `Field`, which wires `aria-describedby`.
- Switches, radio groups, progress bars and timers have correct roles.
- Focus rings use `:focus-visible`.
- Status is never colour-only: badges carry text, and chart legends and tables are provided.
- Reduced motion follows the OS setting plus an in-app toggle.
- There is a skip-to-content link.

### Security

- All API input is validated with Zod, and every query is scoped by `userId`.
- User content is rendered by React. Math goes through KaTeX with `trust: false`, so user HTML is
  never injected.
- CSV export neutralises spreadsheet formulas.
- Imports are validated before any write and run in a single transaction. "Replace" requires
  typed confirmation.
- Secrets live only in `.env`, which is git-ignored.

## Adding authentication later

1. Add an auth library (e.g. Auth.js) and a `User.email`/credentials flow. Passwords must be hashed by the library (argon2/bcrypt).
2. Replace `src/server/user.ts › getCurrentUserId()` with a session lookup, returning 401 when there is no session. Every repository call already filters by that id.
3. Clear the IndexedDB snapshot and queue on sign-out (`idb.ts`).

## Adding AI features later (optional, off by default)

Nothing is sent to any AI provider today. To add features such as "explain this mistake",
create a provider-agnostic interface (`src/server/ai/…`). Call it only from an explicit user
action, show what will be sent, and keep the provider key server-side in `.env`.

## Performance notes

- Recharts and KaTeX are lazily loaded, only on pages that need them.
- Charts bucket long ranges into weeks.
- Selectors are memoized per table, and the clock hook shares one interval per rate.
- There is no polling. Sync is event-driven with backoff, and reminders check once a minute.

## UI components (shadcn/ui)

The UI is built on [shadcn/ui](https://ui.shadcn.com) (Radix base, RTL enabled; configuration in `components.json`).

- **`src/components/ui/`** holds the components exactly as shadcn generates them: button, card, dialog, dropdown-menu, sheet, input, textarea, native-select, checkbox, switch, toggle-group, badge, progress, alert, empty, label, sonner, sidebar, field, tabs, table, popover, calendar, accordion, scroll-area and breadcrumb. Add more with `npx shadcn@latest add <name>`. The code is ours to edit, and two files were tweaked: `progress.tsx` (per-subject colour) and `sonner.tsx` (reads the app's theme setting instead of next-themes).
- **`src/components/app/`** holds thin wrappers that keep the names the pages use (`Button variant="primary"`, `Dialog open onClose title`, `Card / CardHeader / CardBody`, `Field`, `SegmentedControl`, `Menu`, `Badge tone`, …) and are built from the shadcn components above. Pages import from `@/components/app/*`, not from `ui/` directly.
- **Theme:** `globals.css` defines shadcn's semantic tokens (`--background`, `--primary`, `--muted`, …) from the app palette, in light and dark. App-only tokens (`--surface-*`, `--success` / `--warning` / `--danger` / `--info`) sit alongside. In new code use `text-muted-foreground`, `bg-primary`, `text-foreground`.
- **Notifications:** `toast.success / error / warning / show / withAction` (in `lib/store/toast.ts`) call Sonner, which is mounted once in the app shell.
- **Navigation:** desktop/tablet use shadcn's `Sidebar` (icon-collapsible, `SidebarInset`, `SidebarTrigger` in the top bar); phones use a bottom bar plus a `Sheet` for "More". Forms use shadcn `Field` / `FieldLabel` / `FieldDescription` / `FieldError` via `components/app/form.tsx`.
- **Theme:** black canvas (`#000`), `#090909` surfaces and sidebar, off-white primary (`#e6e6e6`). Light mode uses `#fafafa` with a near-black primary. All values live in `globals.css`.
- **Tooling:** the shadcn agent skill (`.agents/skills/shadcn`) and the shadcn MCP server (`.mcp.json`) are installed for this project. Restart Claude Code to load the MCP server.
