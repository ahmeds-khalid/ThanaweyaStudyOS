"use client";

import { ArrowRight, CalendarDays, GraduationCap, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { BlockForm } from "@/components/forms/block-form";
import { OccurrenceRow } from "@/components/calendar/occurrence-row";
import { Button, ButtonLink } from "@/components/app/button";
import { Dialog } from "@/components/app/dialog";
import { Checkbox, Input } from "@/components/app/form";
import { EmptyState } from "@/components/app/misc";
import { setTaskDone } from "@/lib/actions";
import { dateFromKey, formatClock, formatMinutes, minutesToTime, timeToMinutes } from "@/lib/domain/dates";
import { FOCUS_KINDS } from "@/lib/domain/scheduler";
import { effectiveStatus, isTaskForDay } from "@/lib/domain/timeline";
import { dayKind, type Occurrence } from "@/lib/domain/weekly";
import { useNow, useOccurrences, useToday } from "@/lib/hooks";
import { db, useRows, useSettings } from "@/lib/store/data";
import { cn } from "@/lib/utils";

/**
 * Today = the weekly routine for today's weekday, plus due revisions, exams and tasks.
 * It is always filled in from the routine; there is nothing to set up here.
 */
export default function TodayPage() {
  const settings = useSettings();
  const today = useToday();
  const nowMs = useNow(30_000);
  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const occurrences = useOccurrences(today, 1);
  const tasks = useRows("tasks");
  const revisions = useRows("revisions");
  const exams = useRows("exams");
  const [editing, setEditing] = useState<Occurrence | null>(null);
  const [newTask, setNewTask] = useState("");

  const rows = useMemo(
    () => (occurrences.get(today) ?? []).filter((b) => FOCUS_KINDS.has(b.kind)).map((b) => ({ block: b, status: effectiveStatus(b, now) })),
    [occurrences, today, now],
  );
  const nextId = (rows.find((r) => r.status === "in_progress") ?? rows.find((r) => r.status === "upcoming"))?.block.id;
  const activeRows = rows.filter((r) => r.status !== "skipped");
  const allDone = activeRows.length > 0 && activeRows.every((r) => r.status === "completed");
  const lastEnd = activeRows.length ? Math.max(...activeRows.map((r) => timeToMinutes(r.block.start) + r.block.durationMinutes)) : null;
  const todaysTasks = tasks.filter((t) => isTaskForDay(t, today) || (t.status === "completed" && t.completedAt?.startsWith(today)));
  const todaysExams = exams.filter((e) => e.date === today && e.status !== "completed");
  const revisionsDue = revisions.filter((r) => r.status === "pending" && r.scheduledDate <= today).length;
  const kind = dayKind(settings, today);
  const configured = settings.weeklyPlan.configured;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-[28px]">Today</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {dateFromKey(today).toLocaleDateString(settings.general.language === "ar" ? "ar-EG" : "en-GB", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <ButtonLink href="/calendar" variant="ghost" size="sm">
          <CalendarDays /> Calendar
        </ButtonLink>
      </header>

      <section aria-label="Study plan" className="flex flex-col gap-2">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Sparkles />}
            title={!configured ? "Your weekly plan isn't set up yet." : kind === "off" ? "Today is a day off." : "Nothing is scheduled today."}
            description={!configured ? "Set it once and every week fills in by itself." : kind === "off" ? "Enjoy it." : "It's a free day. Your weekly plan decides what repeats."}
            action={
              kind !== "off" && (
                <ButtonLink href="/schedule" variant="primary">
                  Weekly plan
                </ButtonLink>
              )
            }
          />
        ) : (
          rows.map(({ block }) => <OccurrenceRow key={block.id} occ={block} now={now} isNext={block.id === nextId} onEdit={() => setEditing(block)} />)
        )}
      </section>

      {rows.length > 0 && (
        <p className="flex items-center gap-2 text-[13px] font-medium tracking-wide text-muted-foreground uppercase">
          <Sparkles className="size-4 text-success" aria-hidden />
          {allDone || lastEnd == null ? "Done for today — free time" : `Free time after ${formatClock(minutesToTime(lastEnd), settings.general.timeFormat)}`}
        </p>
      )}

      {todaysExams.map((e) => (
        <Link key={e.id} href="/exams" className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-[13px] hover:bg-muted">
          <span className="flex min-w-0 items-center gap-2">
            <GraduationCap className="size-4 shrink-0 text-warning" aria-hidden />
            <span className="truncate font-medium">{e.name}</span>
            <span className="text-muted-foreground">Exam · {formatMinutes(e.durationMinutes)}</span>
          </span>
          <ArrowRight className="size-4 text-muted-foreground rtl:rotate-180" aria-hidden />
        </Link>
      ))}

      {revisionsDue > 0 && (
        <Link href="/revision" className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-[13px] hover:bg-muted">
          <span>
            <span className="font-medium">{revisionsDue} revision{revisionsDue === 1 ? "" : "s"}</span> <span className="text-muted-foreground">to review</span>
          </span>
          <ArrowRight className="size-4 text-muted-foreground rtl:rotate-180" aria-hidden />
        </Link>
      )}

      <section aria-label="Tasks" className="flex flex-col gap-2">
        <h2 className="text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">Tasks</h2>
        {todaysTasks.map((t) => (
          <div key={t.id} className="flex items-center gap-3 rounded-lg px-1 py-1">
            <Checkbox checked={t.status === "completed"} onChange={(v) => setTaskDone(t, v)} label={<span className={cn("text-[14px]", t.status === "completed" && "text-muted-foreground line-through")}>{t.title}</span>} />
          </div>
        ))}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const title = newTask.trim();
            if (!title) return;
            try {
              db.create("tasks", { title, status: "today", dueDate: today });
              setNewTask("");
            } catch {
              /* toast shown */
            }
          }}
        >
          <Input aria-label="Add a task" value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="+ Add task" maxLength={300} />
          <Button type="submit" size="icon" aria-label="Add task" disabled={!newTask.trim()}>
            <Plus />
          </Button>
        </form>
      </section>

      <Dialog open={!!editing} onClose={() => setEditing(null)} title="Edit this occurrence" size="lg">
        {editing && <BlockForm block={editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}
