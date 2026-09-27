"use client";

import { CalendarPlus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/app/button";
import { Dialog } from "@/components/app/dialog";
import { DatePicker } from "@/components/app/form";
import { scheduleLessonRevisions } from "@/lib/actions";
import { addDays, todayKey } from "@/lib/domain/dates";
import type { Lesson } from "@/lib/schemas/entities";
import { db, useSettings } from "@/lib/store/data";
import { toast } from "@/lib/store/toast";

/**
 * "Schedule revision?" — offers the configured interval ladder
 * (default 1/3/7/14/30 days; editable in Settings → Revision).
 */
export function ScheduleRevisionDialog({ lesson, open, onClose }: { lesson: Lesson | null; open: boolean; onClose: () => void }) {
  const settings = useSettings();
  const [custom, setCustom] = useState("");
  const today = todayKey();
  if (!lesson) return null;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="Schedule revision?"
      description={`“${lesson.title}” — choose when to review it. These intervals are your configurable defaults.`}
    >
      <div className="flex flex-col gap-2">
        {settings.revision.intervals.map((days, step) => (
          <Button
            key={step}
            className="justify-between"
            onClick={() => {
              scheduleLessonRevisions(lesson, { step });
              onClose();
            }}
          >
            <span>In {days} day{days === 1 ? "" : "s"}</span>
            <span className="tabular text-xs text-muted-foreground">{addDays(today, days)}</span>
          </Button>
        ))}
        <Button
          variant="primary"
          onClick={() => {
            scheduleLessonRevisions(lesson, "ladder");
            onClose();
          }}
        >
          <CalendarPlus /> Schedule the full ladder ({settings.revision.intervals.join(", ")} days)
        </Button>
        <div className="mt-2 flex items-center gap-2 border-t border-border pt-3">
          <DatePicker aria-label="Custom revision date" value={custom} min={today} onChange={setCustom} />
          <Button
            disabled={!custom}
            onClick={() => {
              db.create("revisions", {
                subjectId: lesson.subjectId,
                lessonId: lesson.id,
                title: lesson.title,
                type: settings.revision.defaultType,
                scheduledDate: custom,
                durationMinutes: settings.revision.defaultDurationMinutes,
              });
              db.update("lessons", lesson.id, { stage: "revision_scheduled" });
              toast.success("Revision scheduled", custom);
              onClose();
            }}
          >
            Custom date
          </Button>
        </div>
        <Button variant="ghost" onClick={onClose}>
          Not now
        </Button>
      </div>
    </Dialog>
  );
}
