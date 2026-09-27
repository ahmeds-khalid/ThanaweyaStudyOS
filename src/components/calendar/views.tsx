"use client";

import { AlertCircle, CalendarClock, Check, CircleCheck, Coffee, GraduationCap, Moon, Pencil, Play, RefreshCcw, SkipForward, Sun, Utensils } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { BlockForm } from "@/components/forms/block-form";
import { Button, ButtonLink } from "@/components/app/button";
import { Dialog } from "@/components/app/dialog";
import { Badge, EmptyState, SubjectDot } from "@/components/app/misc";
import { completeBlock, rescheduleOccurrence, setDayOff, skipOccurrence } from "@/lib/actions";
import { formatClock, formatMinutes, minutesToTime, rangeKeys, timeToMinutes, weekdayOf } from "@/lib/domain/dates";
import { FOCUS_KINDS } from "@/lib/domain/scheduler";
import { buildTimeline, effectiveStatus } from "@/lib/domain/timeline";
import { dayKind, isPlanBlockId, type Occurrence } from "@/lib/domain/weekly";
import { useFmtDate, useNow, useOccurrences, useSubjects, useToday } from "@/lib/hooks";
import { WEEKDAYS, WEEKDAYS_SHORT } from "@/lib/labels";
import { useRows, useSettings } from "@/lib/store/data";
import { cn } from "@/lib/utils";
import { OccurrenceRow, useBlockLabel, useStartBlock } from "./occurrence-row";

/* ------------------------------------------------------------------ */
/* Data for a range of days                                             */
/* ------------------------------------------------------------------ */

/** Everything the three views show for each date, from one source: the routine + stored data. */
function useDays(from: string, count: number) {
  const settings = useSettings();
  const occurrences = useOccurrences(from, count);
  const revisions = useRows("revisions");
  const exams = useRows("exams");
  const tasks = useRows("tasks");
  const today = useToday();
  return useMemo(() => {
    const out = new Map<string, DayData>();
    for (const date of rangeKeys(from, count)) {
      const blocks = (occurrences.get(date) ?? []).filter((b) => FOCUS_KINDS.has(b.kind));
      out.set(date, {
        date,
        kind: dayKind(settings, date),
        off: settings.study.daysOff.includes(date),
        blocks,
        revisions: revisions.filter((r) => r.status === "pending" && (r.scheduledDate === date || (date === today && r.scheduledDate < today))),
        exams: exams.filter((e) => e.date === date),
        tasks: tasks.filter((t) => t.dueDate === date && !t.deletedAt && t.status !== "completed" && t.status !== "archived"),
      });
    }
    return out;
  }, [settings, occurrences, revisions, exams, tasks, from, count, today]);
}

interface DayData {
  date: string;
  kind: ReturnType<typeof dayKind>;
  off: boolean;
  blocks: Occurrence[];
  revisions: { id: string; title: string; subjectId: string | null }[];
  exams: { id: string; name: string; durationMinutes: number; subjectId: string | null }[];
  tasks: { id: string; title: string }[];
}

const counted = (blocks: Occurrence[]) => blocks.filter((b) => b.status !== "skipped");

/* ------------------------------------------------------------------ */
/* Month                                                                */
/* ------------------------------------------------------------------ */
export function MonthView({ gridStart, month, onOpenDay }: { gridStart: string; month: string; onOpenDay: (date: string) => void }) {
  const today = useToday();
  const { byId } = useSubjects();
  const days = useDays(gridStart, 42);
  const dates = rangeKeys(gridStart, 42);
  const weeks = Math.ceil((dates.findLastIndex((d) => d.slice(0, 7) === month) + 1) / 7);
  const shown = dates.slice(0, weeks * 7);
  const head = shown.slice(0, 7).map((d) => WEEKDAYS_SHORT[weekdayOf(d)]);

  return (
    <div>
      <div className="grid grid-cols-7 gap-px px-0.5 pb-1 text-center text-[11px] font-medium text-muted-foreground uppercase">
        {head.map((h) => (
          <div key={h}>{h}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border bg-border">
        {shown.map((date) => {
          const d = days.get(date)!;
          const inMonth = date.slice(0, 7) === month;
          const blocks = counted(d.blocks);
          const dayNum = Number(date.slice(8));
          return (
            <button
              key={date}
              type="button"
              onClick={() => onOpenDay(date)}
              aria-label={`${date}${d.off ? ", day off" : ""}`}
              className={cn(
                "flex min-h-[4.5rem] flex-col gap-0.5 bg-card p-1 text-start transition-colors hover:bg-muted sm:min-h-24 sm:p-1.5",
                !inMonth && "bg-background text-muted-foreground opacity-60",
              )}
            >
              <span className={cn("flex size-5 items-center justify-center rounded-full text-[11px] font-medium sm:size-6 sm:text-xs", date === today && "bg-primary text-primary-foreground")}>{dayNum}</span>
              {d.kind === "off" ? (
                <span className="text-[10px] font-medium text-muted-foreground uppercase">{d.off ? "Day off" : "Off"}</span>
              ) : (
                <>
                  {/* Phones: dots. Larger screens: subject names. */}
                  <span className="flex flex-wrap gap-0.5 sm:hidden">
                    {blocks.slice(0, 6).map((b) => (
                      <SubjectDot key={b.id} color={b.subjectId ? byId.get(b.subjectId)?.color : undefined} />
                    ))}
                  </span>
                  <span className="hidden flex-col gap-0.5 sm:flex">
                    {blocks.slice(0, 3).map((b) => {
                      const s = b.subjectId ? byId.get(b.subjectId) : undefined;
                      return (
                        <span key={b.id} className="flex items-center gap-1 truncate text-[11px] leading-tight">
                          <SubjectDot color={s?.color} className="size-1.5" />
                          <span className={cn("truncate", b.status === "completed" && "text-muted-foreground line-through")}>{b.title || s?.name || "Study"}</span>
                        </span>
                      );
                    })}
                    {blocks.length > 3 && <span className="text-[10px] text-muted-foreground">+{blocks.length - 3} more</span>}
                  </span>
                </>
              )}
              <span className="mt-auto flex flex-wrap gap-1">
                {d.exams.length > 0 && <Badge tone="warning" className="px-1 py-0 text-[10px]">Exam</Badge>}
                {d.revisions.length > 0 && <Badge tone="info" className="px-1 py-0 text-[10px]">↻ {d.revisions.length}</Badge>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Week                                                                 */
/* ------------------------------------------------------------------ */

export function WeekView({ weekStart, onOpenDay }: { weekStart: string; onOpenDay: (date: string) => void }) {
  const settings = useSettings();
  const today = useToday();
  const now = useNow(60_000);
  const { byId } = useSubjects();
  const days = useDays(weekStart, 7);
  const [open, setOpen] = useState<Occurrence | null>(null);

  return (
    <>
      <div className="grid gap-3 md:grid-cols-7 md:gap-2">
        {rangeKeys(weekStart, 7).map((date) => {
          const d = days.get(date)!;
          const items = buildTimeline(settings, date, d.blocks, []).filter((it) => it.type === "block" || it.type === "break" || it.type === "free");
          return (
            <section key={date} aria-label={date} className={cn("flex min-w-0 flex-col gap-1.5 rounded-xl border bg-card p-2", date === today && "border-primary/50")}>
              <button type="button" onClick={() => onOpenDay(date)} className="flex items-baseline justify-between gap-1 rounded text-start hover:underline">
                <span className="text-[13px] font-semibold uppercase">{WEEKDAYS_SHORT[weekdayOf(date)]}</span>
                <span className="text-xs text-muted-foreground">{Number(date.slice(8))}</span>
              </button>
              {d.kind === "off" ? (
                <p className="text-xs font-medium text-muted-foreground uppercase">{d.off ? "Day off" : "Off"}</p>
              ) : items.filter((it) => it.type === "block").length === 0 && d.exams.length === 0 ? (
                <p className="text-xs text-muted-foreground">Free day</p>
              ) : null}
              {d.exams.map((e) => (
                <Link key={e.id} href="/exams" className="flex items-center gap-1 rounded-md bg-warning-soft px-1.5 py-1 text-[11px] font-medium text-warning">
                  <GraduationCap className="size-3 shrink-0" aria-hidden />
                  <span className="truncate">{e.name}</span>
                </Link>
              ))}
              {d.kind !== "off" &&
                items.map((it, i) => {
                  if (it.type === "break") return <p key={`b${i}`} className="px-1 text-[11px] text-muted-foreground">Break · {formatMinutes(it.end - it.start)}</p>;
                  if (it.type === "free") return <p key={`f${i}`} className="px-1 text-[11px] text-success">Free time · {formatClock(minutesToTime(it.start), settings.general.timeFormat)}+</p>;
                  const b = it.block as Occurrence;
                  const s = b.subjectId ? byId.get(b.subjectId) : undefined;
                  const status = effectiveStatus(b, new Date(now));
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setOpen(b)}
                      className={cn("flex flex-col gap-0.5 rounded-md border px-1.5 py-1 text-start hover:bg-muted", (status === "completed" || status === "skipped") && "opacity-60")}
                    >
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        {status === "completed" ? <CircleCheck className="size-3 text-success" aria-label="Completed" /> : status === "overdue" ? <AlertCircle className="size-3 text-warning" aria-label="Not done" /> : null}
                        {formatClock(b.start, settings.general.timeFormat)}–{formatClock(minutesToTime(timeToMinutes(b.start) + b.durationMinutes), settings.general.timeFormat)}
                      </span>
                      <span className={cn("flex items-center gap-1 text-xs font-medium", status === "skipped" && "line-through")}>
                        <SubjectDot color={s?.color} className="size-1.5" />
                        <span className="truncate">{b.title || s?.name || "Study"}</span>
                      </span>
                    </button>
                  );
                })}
              {d.revisions.length > 0 && (
                <Link href="/revision" className="flex items-center gap-1 px-1 text-[11px] text-info">
                  <RefreshCcw className="size-3" aria-hidden /> Revision · {d.revisions.length}
                </Link>
              )}
            </section>
          );
        })}
      </div>
      <BlockDialog occ={open} onClose={() => setOpen(null)} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Block details                                                        */
/* ------------------------------------------------------------------ */

/** Click a block → its details with Start / Complete / Skip / Reschedule / Edit. */
export function BlockDialog({ occ, onClose }: { occ: Occurrence | null; onClose: () => void }) {
  const [editing, setEditing] = useState(false);
  const start = useStartBlock();
  const today = useToday();
  const fd = useFmtDate();
  const settings = useSettings();
  if (!occ) return null;
  return <BlockDialogBody key={occ.id} occ={occ} onClose={() => { setEditing(false); onClose(); }} editing={editing} setEditing={setEditing} start={start} today={today} fd={fd} tf={settings.general.timeFormat} />;
}

function BlockDialogBody({ occ, onClose, editing, setEditing, start, today, fd, tf }: { occ: Occurrence; onClose: () => void; editing: boolean; setEditing: (v: boolean) => void; start: (o: Occurrence) => void; today: string; fd: (d: string) => string; tf: "24h" | "12h" }) {
  const { subject, lesson, label } = useBlockLabel(occ);
  const status = effectiveStatus(occ, new Date());
  const open = status !== "completed" && status !== "skipped";
  const end = minutesToTime(timeToMinutes(occ.start) + occ.durationMinutes);
  return (
    <Dialog open onClose={onClose} title={editing ? "Edit this occurrence" : label} size="lg">
      {editing ? (
        <BlockForm block={occ} onDone={onClose} />
      ) : (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
            <dt className="text-muted-foreground">When</dt>
            <dd>
              {fd(occ.date)} · {formatClock(occ.start, tf)}–{formatClock(end, tf)} ({formatMinutes(occ.durationMinutes)})
            </dd>
            {subject && (
              <>
                <dt className="text-muted-foreground">Subject</dt>
                <dd className="flex items-center gap-1.5">
                  <SubjectDot color={subject.color} /> {subject.name}
                </dd>
              </>
            )}
            {lesson && (
              <>
                <dt className="text-muted-foreground">Continues with</dt>
                <dd>{lesson.title}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Status</dt>
            <dd className="capitalize">{status === "overdue" ? "Not done" : status.replace("_", " ")}</dd>
          </dl>
          {isPlanBlockId(occ.id) && <p className="text-xs text-muted-foreground">Part of your weekly plan. Changes here affect only this date.</p>}
          <div className="flex flex-wrap gap-2">
            {open && occ.date === today && (
              <Button variant="primary" onClick={() => { onClose(); start(occ); }}>
                <Play /> Start
              </Button>
            )}
            {open && (
              <Button onClick={() => { completeBlock(occ); onClose(); }}>
                <Check /> Complete
              </Button>
            )}
            {open && (
              <Button onClick={() => { skipOccurrence(occ); onClose(); }}>
                <SkipForward /> Skip
              </Button>
            )}
            {open && (
              <Button onClick={() => { if (rescheduleOccurrence(occ)) onClose(); }}>
                <CalendarClock /> Reschedule
              </Button>
            )}
            <Button variant="ghost" onClick={() => setEditing(true)}>
              <Pencil /> Edit
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Day                                                                  */
/* ------------------------------------------------------------------ */

export function DayView({ date }: { date: string }) {
  const settings = useSettings();
  const today = useToday();
  const nowMs = useNow(30_000);
  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const days = useDays(date, 1);
  const d = days.get(date)!;
  const { byId } = useSubjects();
  const tf = settings.general.timeFormat;
  const [editing, setEditing] = useState<Occurrence | null>(null);
  const items = useMemo(() => buildTimeline(settings, date, d.blocks, []), [settings, date, d.blocks]);
  const nextId = date === today ? d.blocks.find((b) => effectiveStatus(b, now) === "upcoming" || b.status === "in_progress")?.id : undefined;
  const weekly = settings.weeklyPlan.days[weekdayOf(date)];
  const clock = (m: number) => formatClock(minutesToTime(m % 1440), tf);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted-foreground">
          {WEEKDAYS[weekdayOf(date)]}
          {d.off ? " · marked as a day off" : d.kind === "off" ? " · off in your weekly plan" : d.kind === "catchup" ? " · catch-up day" : ""}
        </p>
        <div className="flex gap-2">
          {d.kind !== "off" || d.off ? (
            <Button size="sm" variant="secondary" onClick={() => setDayOff(date, !d.off)}>
              {d.off ? "Restore this day" : "Day off"}
            </Button>
          ) : null}
          <ButtonLink href="/schedule" size="sm" variant="ghost">
            Weekly plan
          </ButtonLink>
        </div>
      </div>

      {d.kind === "off" && d.blocks.length === 0 ? (
        <EmptyState icon={<Sun />} title={d.off ? "Day off." : "Nothing planned. This weekday is off."} description={d.off ? "Your weekly plan for this weekday is unchanged." : `${WEEKDAYS[weekdayOf(date)]} is switched off in your weekly plan.`} />
      ) : (
        items.map((it, i) => {
          if (it.type === "block") {
            const b = it.block as Occurrence;
            return <OccurrenceRow key={b.id} occ={b} now={now} isNext={b.id === nextId} onEdit={() => setEditing(b)} />;
          }
          const line = (icon: React.ReactNode, text: string, tone = "text-muted-foreground") => (
            <p key={`${it.type}${i}`} className={cn("flex items-center gap-2 px-2 text-[13px]", tone)}>
              {icon}
              {text}
            </p>
          );
          if (it.type === "wake") return line(<Sun className="size-3.5" />, `Wake up · ${clock(it.start)}`);
          if (it.type === "sleep") return line(<Moon className="size-3.5" />, `Bedtime · ${clock(it.start)}`);
          if (it.type === "meal") return line(<Utensils className="size-3.5" />, `${it.name} · ${clock(it.start)}`);
          if (it.type === "break") return line(<Coffee className="size-3.5" />, `Break · ${formatMinutes(it.end - it.start)}`);
          if (it.type === "free") return line(<Sun className="size-3.5" />, `Free time · ${clock(it.start)}–${clock(it.end)}`, "font-medium text-success");
          return null;
        })
      )}

      {d.exams.map((e) => (
        <Link key={e.id} href="/exams" className="flex items-center gap-2 rounded-xl border border-warning/40 bg-warning-soft px-3.5 py-3 text-[13px] text-warning">
          <GraduationCap className="size-4 shrink-0" aria-hidden />
          <span className="font-medium">{e.name}</span>
          <span className="opacity-80">
            Exam · {formatMinutes(e.durationMinutes)}
            {e.subjectId && byId.get(e.subjectId) ? ` · ${byId.get(e.subjectId)!.name}` : ""}
          </span>
        </Link>
      ))}
      {d.revisions.length > 0 && (
        <Link href="/revision" className="flex flex-col gap-1 rounded-xl border bg-card px-3.5 py-3 text-[13px] hover:bg-muted">
          <span className="flex items-center gap-2 font-medium">
            <RefreshCcw className="size-4 text-info" aria-hidden /> Revision · {d.revisions.length}
          </span>
          {d.revisions.slice(0, 4).map((r) => (
            <span key={r.id} className="truncate ps-6 text-muted-foreground">
              {r.title || "Revision"}
            </span>
          ))}
        </Link>
      )}
      {d.tasks.length > 0 && (
        <div className="rounded-xl border bg-card px-3.5 py-3 text-[13px]">
          <p className="font-medium">Tasks due</p>
          {d.tasks.map((t) => (
            <p key={t.id} className="mt-1 text-muted-foreground">
              {t.title}
            </p>
          ))}
        </div>
      )}
      {d.kind !== "off" && d.blocks.length === 0 && weekly.slots.length === 0 && d.exams.length === 0 && (
        <p className="px-2 text-[13px] text-muted-foreground">Nothing is planned for this weekday.</p>
      )}
      <Dialog open={!!editing} onClose={() => setEditing(null)} title="Edit this occurrence" size="lg">
        {editing && <BlockForm block={editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}

