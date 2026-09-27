"use client";

import { ExternalLink, Plus, RefreshCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { RevisionForm } from "@/components/forms/forms-a";
import { SubjectBadge } from "@/components/study/cards";
import { Button, ButtonLink } from "@/components/app/button";
import { Card } from "@/components/app/card";
import { Dialog } from "@/components/app/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/app/form";
import { Badge, EmptyState, PageHeader } from "@/components/app/misc";
import { completeRevision } from "@/lib/actions";
import { formatMinutes } from "@/lib/domain/dates";
import { nextReview } from "@/lib/domain/revision";
import { useFmtDate, useToday } from "@/lib/hooks";
import { RATING_LABELS } from "@/lib/labels";
import type { Revision } from "@/lib/schemas/entities";
import { db, useRows, useSettings } from "@/lib/store/data";
import { cn } from "@/lib/utils";

export default function RevisionPage() {
  const revisions = useRows("revisions");
  const today = useToday();
  const fd = useFmtDate();
  const [open, setOpen] = useState<Revision | null>(null);
  const [adding, setAdding] = useState(false);

  const { due, overdue, upcoming } = useMemo(() => {
    const pending = revisions.filter((r) => r.status === "pending").sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
    return {
      due: pending.filter((r) => r.scheduledDate === today),
      overdue: pending.filter((r) => r.scheduledDate < today),
      upcoming: pending.filter((r) => r.scheduledDate > today),
    };
  }, [revisions, today]);
  const toReview = [...overdue, ...due];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="Revision"
        actions={
          <>
            <ButtonLink href="/mistakes" variant="ghost">
              <TriangleAlert /> Mistakes
            </ButtonLink>
            <Button onClick={() => setAdding(true)}>
              <Plus /> Add
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-3 gap-3 text-center">
        <Count label="Today" value={due.length} />
        <Count label="Overdue" value={overdue.length} warn={overdue.length > 0} />
        <Count label="Upcoming" value={upcoming.length} />
      </div>

      <Tabs defaultValue="review">
        <TabsList>
          <TabsTrigger value="review">Due ({toReview.length})</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="review" className="mt-3">
          {toReview.length === 0 ? (
            <EmptyState icon={<RefreshCcw />} title="No revisions due today." description="Revisions are scheduled when you complete a lesson or log a mistake." />
          ) : (
            <Card className="divide-y divide-border">
              {toReview.map((r) => (
                <button key={r.id} onClick={() => setOpen(r)} className="flex w-full items-center gap-3 px-4 py-3.5 text-start hover:bg-muted">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{r.title || "Revision"}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <SubjectBadge subjectId={r.subjectId} />
                      <span>{formatMinutes(r.durationMinutes)}</span>
                      {r.mistakeId && <Badge tone="danger">Mistake</Badge>}
                    </div>
                  </div>
                  {r.scheduledDate < today && <Badge tone="warning">Overdue</Badge>}
                </button>
              ))}
            </Card>
          )}
        </TabsContent>
        <TabsContent value="upcoming" className="mt-3">
          {upcoming.length === 0 ? (
            <EmptyState icon={<RefreshCcw />} title="Nothing scheduled ahead." />
          ) : (
            <Card className="divide-y divide-border">
              {upcoming.map((r) => (
                <button key={r.id} onClick={() => setOpen(r)} className="flex w-full items-center gap-3 px-4 py-3 text-start text-[13px] hover:bg-muted">
                  <span className="min-w-0 flex-1 truncate">{r.title || "Revision"}</span>
                  <span className="tabular text-xs text-muted-foreground">{fd(r.scheduledDate)}</span>
                </button>
              ))}
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <RateDialog revision={open} onClose={() => setOpen(null)} />
      <Dialog open={adding} onClose={() => setAdding(false)} title="Schedule revision" size="lg">
        {adding && <RevisionForm onDone={() => setAdding(false)} />}
      </Dialog>
    </div>
  );
}

function Count({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-surface py-3">
      <div className={cn("tabular text-2xl font-semibold", warn && "text-warning")}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

/** Review the lesson, then rate how well it was remembered (1–5). */
function RateDialog({ revision, onClose }: { revision: Revision | null; onClose: () => void }) {
  const settings = useSettings();
  const today = useToday();
  const [scheduleNext, setScheduleNext] = useState(true);
  const [rating, setRating] = useState<number | null>(null);
  if (!revision) return null;
  const lesson = db.get("lessons", revision.lessonId);
  const next = rating ? nextReview(today, revision.step, rating, settings.revision) : null;
  const close = () => {
    setRating(null);
    onClose();
  };
  return (
    <Dialog
      open={!!revision}
      onClose={close}
      size="sm"
      title={revision.title || "Revision"}
      footer={
        <>
          <Button variant="ghost" onClick={() => { db.update("revisions", revision.id, { status: "skipped" }); close(); }}>
            Skip
          </Button>
          <Button
            variant="primary"
            disabled={!rating}
            onClick={() => {
              completeRevision(revision, rating!, { scheduleNext });
              close();
            }}
          >
            Done
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {lesson && (
          <Link href={`/lessons/${lesson.id}`} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline">
            <ExternalLink className="size-3.5" aria-hidden /> Review lesson
          </Link>
        )}
        <div>
          <p className="mb-2 text-sm font-medium">How well did you remember it?</p>
          <div role="radiogroup" aria-label="How well did you remember it" className="grid grid-cols-5 gap-2">
            {RATING_LABELS.map((label, i) => (
              <button
                key={label}
                role="radio"
                aria-checked={rating === i + 1}
                aria-label={`${i + 1} — ${label}`}
                title={label}
                onClick={() => setRating(i + 1)}
                className={cn("h-11 rounded-lg border text-base font-semibold transition-colors", rating === i + 1 ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-surface-2")}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <p className="mt-2 flex justify-between text-[11px] text-muted-foreground">
            <span>Forgot</span>
            <span>Excellent</span>
          </p>
          {next && !revision.mistakeId && scheduleNext && <p className="mt-3 text-xs text-muted-foreground">Next review in {next.intervalDays} day{next.intervalDays === 1 ? "" : "s"}.</p>}
        </div>
        {!revision.mistakeId && <Checkbox checked={scheduleNext} onChange={setScheduleNext} label="Schedule the next review" />}
      </div>
    </Dialog>
  );
}
