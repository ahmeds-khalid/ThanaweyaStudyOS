# Features

The app is built around one loop: **open → see what to do → start → study → finish → leave.**

## Navigation

- **Desktop / tablet:** Dashboard · Today · Subjects · Revision, with Settings at the bottom.
- **Mobile:** Dashboard · Today · Study · Revision · More (Subjects, Mistakes, Exams, Settings).
- **Top bar:** the running-timer indicator (only while a timer is active), "+ Add" (task / mistake / exam), theme toggle, settings.
- Mistakes are opened from Revision, and Exams from Subjects.

## Pages

| Page | What it does |
|---|---|
| **Dashboard** | Five sections: today's progress, next study session (START), curriculum progress per subject, revision due (today / overdue), this week (focused time, lessons, questions, study days). |
| **Today** | The plan for the day: ✓ done, → next (with START), ○ later, then "Free time after …". Each block has Complete / Skip / Reschedule / Edit. A missed block offers Reschedule, Move to catch-up, Skip or Do now. Simple tasks live here, with an inline "+ Add task". |
| **Study** (`/study`) | Setup (subject, lesson, activity, duration, timer preset) → optional Phone Away → minimal timer screen (timer, subject, lesson, Pause, Finish, Capture thought; optional Focus Mode) → Session complete (focused minutes, questions and correct → accuracy, focus / difficulty / confidence stars, notes; optionally add a mistake, schedule a revision, mark the lesson complete; captured thoughts can become tasks or be dismissed). |
| **Subjects** | Subject list with progress. Each subject page shows progress, the current lesson (with Study), basic statistics, and the Unit → Chapter → Lesson tree, plus edit / archive / delete and JSON / CSV import & export. |
| **Lesson** | Study, Mark complete, Schedule revision, Add mistake, notes (autosave), status, basic stats. |
| **Revision** | Today / Overdue / Upcoming counts. Open an item → "Review lesson" → "How well did you remember it?" 1–5 → Done, and the next review date is scheduled by your configured rules. |
| **Mistakes** | Subject, lesson, question (LaTeX supported), what went wrong, correct method, type, optional screenshot. Review, Resolve, Schedule revision. |
| **Exams** | A simple tracker: name, subject, date, score, total marks (percentage is calculated), notes. |
| **Settings** | General, Study, Subjects, Pomodoro, Revision, Notifications, Display, Data (backup and restore). |
| **Setup** | First launch, 4 steps: you, subjects, routine, current progress. Then your plan is generated. |

## How the plan works

There is one plan, and three screens show it:

| Screen | Answers |
|---|---|
| **Weekly Study Plan** (`/schedule`) | *How should I study this week?* Your recurring routine: per weekday, the subjects (or weekly revision / catch-up), preferred start time and duration; day off and catch-up day flags; an optional "repeats until" date. It is first built from each subject's priority and weekly sessions, then it is yours to edit. |
| **Calendar** (`/calendar`) | *When am I studying?* Month, Week and Day views of the same plan, with revisions, exams, tasks, breaks, free time, meals, wake-up and bedtime. Click a block for details, Start, Complete, Skip, Reschedule or Edit this occurrence. Mark a single date as a day off. |
| **Today** | *What do I do right now?* Today's blocks from the routine, plus due revisions, exams and tasks. It is never empty unless nothing is scheduled. |

Changing one date (moving Mathematics to 18:00, skipping a block, a day off) affects that date only;
the weekly routine is not touched. Each study block also shows the lesson it continues with, taken
from your curriculum progress, and you can override it. Missing a block never rewrites the week: you
choose Reschedule, Move to catch-up or Skip. See `ARCHITECTURE.md` → *The weekly plan*.

## Kept behind the scenes

The database still has the tables for question sets, goals, calendar events, sleep entries,
reviews, roadmap phases and the rest, so old backups load and features can return. The UI for
them was removed. Unused domain code (analytics, streaks, workload levels) is kept and unit-tested.

## Removed from the UI

Sessions, Tasks, Question Sets, Goals, Roadmap, Reviews, Sleep, Thought
Parking and Analytics pages; the dedicated Pomodoro page; the exam runner; the command palette and
global search; keyboard shortcuts; sidebar badges; the sync indicator; the streak, workload and
consistency scores; the adaptive-workload card; Start Small; demo data.

## Limitations

- Reminders (study, revision, exam) fire only while the app is open in a browser tab.
- Arabic switches the layout to right-to-left, but only navigation and core labels are translated.
- Offline: previously loaded data and the timer work, and changes sync when you reconnect.
- No login yet (single local user).

## Tests

`npm test` runs 67 unit tests (timezone `Africa/Cairo`): the weekly plan, next-slot
search, revision rules, timer maths, accuracy and percentages, workload levels, date and DST edge
cases, settings, validation, backup import / export, CSV, curriculum import, and analytics.
