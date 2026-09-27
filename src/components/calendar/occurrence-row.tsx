"use client";

import { AlertCircle, ArrowRight, CalendarClock, Check, Circle, CircleCheck, Inbox, Pencil, Play, SkipForward, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/app/button";
import { Menu, MenuItem } from "@/components/app/menu";
import { SubjectDot } from "@/components/app/misc";
import { completeBlock, materialize, moveOccurrenceToCatchUp, reopenBlock, rescheduleOccurrence, skipOccurrence } from "@/lib/actions";
import { formatClock, formatMinutes, minutesToTime, timeToMinutes } from "@/lib/domain/dates";
import { effectiveStatus } from "@/lib/domain/timeline";
import type { Occurrence } from "@/lib/domain/weekly";
import { useSubjects } from "@/lib/hooks";
import { ACTIVITY_LABELS } from "@/lib/labels";
import { useRow, useSettings } from "@/lib/store/data";
import { cn } from "@/lib/utils";

/** What a block is called: its own title, else its subject. */
export function useBlockLabel(occ: Occurrence) {
  const { byId } = useSubjects();
  const subject = occ.subjectId ? byId.get(occ.subjectId) : undefined;
  const lesson = useRow("lessons", occ.lessonId);
  return { subject, lesson, label: occ.title || subject?.name || "Study" };
}

/** Start opens the study screen for the block (a not-yet-stored block is stored first). */
export function useStartBlock() {
  const router = useRouter();
  return (occ: Occurrence) => router.push(`/study?block=${encodeURIComponent(materialize(occ).id)}`);
}

/** Complete / Skip / Reschedule / Edit for one block. The same menu is used in Today, the calendar and the block dialog. */
export function BlockMenu({ occ, status, onEdit, onDone }: { occ: Occurrence; status: ReturnType<typeof effectiveStatus>; onEdit: () => void; onDone?: () => void }) {
  const { label } = useBlockLabel(occ);
  const open = status !== "completed" && status !== "skipped";
  const run = (fn: () => void) => () => {
    fn();
    onDone?.();
  };
  return (
    <Menu label={`Actions for ${label}`}>
      {open && (
        <MenuItem icon={<Check />} onClick={run(() => completeBlock(occ))}>
          Complete
        </MenuItem>
      )}
      {open && (
        <MenuItem icon={<SkipForward />} onClick={run(() => skipOccurrence(occ))}>
          Skip
        </MenuItem>
      )}
      {open && (
        <MenuItem icon={<CalendarClock />} onClick={run(() => rescheduleOccurrence(occ))}>
          Reschedule
        </MenuItem>
      )}
      {!open && (
        <MenuItem icon={<Undo2 />} onClick={run(() => reopenBlock(occ))}>
          Undo
        </MenuItem>
      )}
      <MenuItem icon={<Pencil />} onClick={onEdit}>
        Edit this occurrence
      </MenuItem>
    </Menu>
  );
}

/** One study block with its status, START button and (when missed) the catch-up choices. */
export function OccurrenceRow({ occ, now, isNext, onEdit }: { occ: Occurrence; now: Date; isNext: boolean; onEdit: () => void }) {
  const settings = useSettings();
  const start = useStartBlock();
  const { subject, lesson, label } = useBlockLabel(occ);
  const status = effectiveStatus(occ, now);
  const done = status === "completed";
  const skipped = status === "skipped";
  const missed = status === "overdue";
  const end = minutesToTime(timeToMinutes(occ.start) + occ.durationMinutes);
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3.5 transition-colors",
        isNext ? "border-primary/50 bg-accent-soft/40" : "border-border bg-surface",
        (done || skipped) && "opacity-60",
      )}
    >
      <span className="shrink-0" aria-hidden>
        {done ? (
          <CircleCheck className="size-5 text-success" />
        ) : isNext ? (
          <ArrowRight className="size-5 text-primary rtl:rotate-180" />
        ) : missed ? (
          <AlertCircle className="size-5 text-warning" />
        ) : (
          <Circle className="size-5 text-subtle" />
        )}
      </span>
      <span className="sr-only">{done ? "Completed" : skipped ? "Skipped" : missed ? "Missed" : isNext ? "Next" : "Upcoming"}</span>
      <div className="min-w-0 flex-1">
        <p className={cn("flex items-center gap-2 text-[15px] leading-snug font-medium", skipped && "line-through")}>
          {subject && <SubjectDot color={subject.color} />}
          <span className="truncate">{label}</span>
        </p>
        {lesson && (
          <p className="mt-0.5 flex items-center gap-1 truncate text-[13px] text-muted-foreground">
            <ArrowRight className="size-3 shrink-0 rtl:rotate-180" aria-hidden />
            <span className="truncate">{lesson.title}</span>
          </p>
        )}
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatClock(occ.start, settings.general.timeFormat)}–{formatClock(end, settings.general.timeFormat)} · {formatMinutes(occ.durationMinutes)}
          {occ.activity && occ.kind === "study" && !lesson ? ` · ${ACTIVITY_LABELS[occ.activity]}` : ""}
          {missed && <span className="text-warning"> · Not done</span>}
          {skipped && " · Skipped"}
        </p>
        {missed && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button size="xs" onClick={() => moveOccurrenceToCatchUp(occ)}>
              <Inbox /> Move to catch-up
            </Button>
            <Button size="xs" onClick={() => rescheduleOccurrence(occ)}>
              <CalendarClock /> Reschedule
            </Button>
            <Button size="xs" variant="ghost" onClick={() => skipOccurrence(occ)}>
              <SkipForward /> Skip
            </Button>
          </div>
        )}
      </div>
      {(isNext || missed) && !done && (
        <Button variant={isNext ? "primary" : "secondary"} size="md" aria-label={`Start ${label}`} onClick={() => start(occ)}>
          <Play /> {isNext ? "START" : "Do now"}
        </Button>
      )}
      <BlockMenu occ={occ} status={status} onEdit={onEdit} />
    </div>
  );
}
