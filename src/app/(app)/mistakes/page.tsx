"use client";

import { ArrowLeft, CalendarPlus, Check, CheckCircle2, Pencil, Plus, RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { MistakeForm } from "@/components/forms/forms-a";
import { MathText } from "@/components/math-text";
import { SubjectBadge } from "@/components/study/cards";
import { Button } from "@/components/app/button";
import { Card, CardBody } from "@/components/app/card";
import { Dialog } from "@/components/app/dialog";
import { Select, SegmentedControl } from "@/components/app/form";
import { Badge, EmptyState, PageHeader } from "@/components/app/misc";
import { reviewMistake } from "@/lib/actions";
import { nextReview } from "@/lib/domain/revision";
import { useSubjects, useToday } from "@/lib/hooks";
import { MISTAKE_TYPE_LABELS, RATING_LABELS } from "@/lib/labels";
import type { Mistake } from "@/lib/schemas/entities";
import { confirmAction } from "@/lib/store/confirm";
import { db, useRow, useRows, useSettings } from "@/lib/store/data";
import { toast } from "@/lib/store/toast";

export default function MistakesPage() {
  return (
    <Suspense>
      <Mistakes />
    </Suspense>
  );
}

function Mistakes() {
  const params = useSearchParams();
  const mistakes = useRows("mistakes");
  const today = useToday();
  const { active } = useSubjects();
  const [subject, setSubject] = useState("");
  const [view, setView] = useState<"open" | "resolved">("open");
  const [editing, setEditing] = useState<Mistake | null>(() => (params.get("open") ? (db.get("mistakes", params.get("open")) ?? null) : null));
  const [adding, setAdding] = useState(false);
  const [reviewing, setReviewing] = useState<Mistake | null>(null);

  const list = useMemo(
    () =>
      mistakes
        .filter((m) => (view === "open" ? !m.resolved : m.resolved))
        .filter((m) => !subject || m.subjectId === subject)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [mistakes, view, subject],
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div>
        <Link href="/revision" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5 rtl:rotate-180" aria-hidden /> Revision
        </Link>
      </div>
      <PageHeader
        title="Mistakes"
        className="!mb-0"
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus /> Add
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          label="Show"
          value={view}
          onChange={setView}
          options={[
            { value: "open", label: "Open" },
            { value: "resolved", label: "Resolved" },
          ]}
        />
        <Select aria-label="Filter by subject" className="w-auto" value={subject} onChange={(e) => setSubject(e.target.value)}>
          <option value="">All subjects</option>
          {active.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<TriangleAlert />}
          title={mistakes.length === 0 ? "No mistakes recorded." : view === "open" ? "Nothing open." : "Nothing resolved yet."}
          action={mistakes.length === 0 ? <Button onClick={() => setAdding(true)}><Plus /> Add mistake</Button> : undefined}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((m) => {
            const due = !m.resolved && m.nextReviewDate && m.nextReviewDate <= today;
            return (
              <Card key={m.id} className={m.resolved ? "opacity-70" : undefined}>
                <CardBody className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <SubjectBadge subjectId={m.subjectId} />
                    <LessonName id={m.lessonId} />
                    <Badge tone="danger">{MISTAKE_TYPE_LABELS[m.type]}</Badge>
                    {due && <Badge tone="accent">Review due</Badge>}
                  </div>
                  <MathText text={m.question} className="text-[14px] font-medium" />
                  {m.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.image} alt="Mistake screenshot" className="max-h-40 w-fit rounded-lg border border-border object-contain" />
                  )}
                  {m.explanation && (
                    <div className="text-[13px]">
                      <p className="text-xs font-medium text-muted-foreground">What went wrong</p>
                      <MathText text={m.explanation} />
                    </div>
                  )}
                  {m.correctMethod && (
                    <div className="rounded-lg bg-success-soft/40 p-2.5 text-[13px]">
                      <p className="text-xs font-medium text-success">Correct method</p>
                      <MathText text={m.correctMethod} />
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {!m.resolved && (
                      <Button size="sm" variant={due ? "primary" : "secondary"} onClick={() => setReviewing(m)}>
                        <Check /> Review
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => db.update("mistakes", m.id, { resolved: !m.resolved })}>
                      {m.resolved ? <RotateCcw /> : <CheckCircle2 />} {m.resolved ? "Reopen" : "Resolve"}
                    </Button>
                    {!m.resolved && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          db.create("revisions", {
                            subjectId: m.subjectId,
                            lessonId: m.lessonId,
                            mistakeId: m.id,
                            title: `Mistake: ${m.question.slice(0, 80)}`,
                            type: "mistake_review",
                            scheduledDate: today,
                            durationMinutes: 10,
                            step: m.step,
                          });
                          toast.success("Added to Revision");
                        }}
                      >
                        <CalendarPlus /> Schedule revision
                      </Button>
                    )}
                    <Button size="icon-sm" variant="ghost" aria-label="Edit mistake" className="ms-auto" onClick={() => setEditing(m)}>
                      <Pencil />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Delete mistake"
                      onClick={async () => {
                        if (await confirmAction({ title: "Delete this mistake?", confirmLabel: "Delete", destructive: true })) db.remove("mistakes", m.id, { label: "Mistake" });
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      <ReviewDialog mistake={reviewing} onClose={() => setReviewing(null)} />
      <Dialog
        open={adding || !!editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        title={editing ? "Edit mistake" : "Add mistake"}
        size="lg"
      >
        {(adding || editing) && (
          <MistakeForm
            mistake={editing ?? undefined}
            onDone={() => {
              setAdding(false);
              setEditing(null);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function LessonName({ id }: { id: string | null }) {
  const lesson = useRow("lessons", id);
  return lesson ? <Badge>{lesson.title}</Badge> : null;
}

function ReviewDialog({ mistake, onClose }: { mistake: Mistake | null; onClose: () => void }) {
  const settings = useSettings();
  const today = useToday();
  if (!mistake) return null;
  return (
    <Dialog open={!!mistake} onClose={onClose} size="md" title="Review mistake" description="Try the question again first. Then rate how well you remember the correct method.">
      <div className="flex flex-col gap-4">
        <MathText text={mistake.question} className="rounded-lg border border-border bg-surface-2 p-3 text-[13px]" />
        <Accordion type="single" collapsible>
  <AccordionItem value="x" className="border-none">
    <AccordionTrigger className="py-1 text-[13px] text-muted-foreground hover:no-underline">Show correct method</AccordionTrigger>
    <AccordionContent><MathText text={mistake.correctMethod || "—"} className="mt-2" /></AccordionContent>
  </AccordionItem>
</Accordion>
        <div className="flex flex-col gap-2">
          {RATING_LABELS.map((label, i) => {
            const next = nextReview(today, mistake.step, i + 1, settings.revision);
            return (
              <Button
                key={label}
                className="h-10 justify-between"
                onClick={() => {
                  reviewMistake(mistake, i + 1);
                  onClose();
                }}
              >
                <span>
                  <span className="tabular me-2 font-semibold">{i + 1}</span>
                  {label}
                </span>
                <span className="text-xs text-muted-foreground">next in {next.intervalDays}d</span>
              </Button>
            );
          })}
        </div>
      </div>
    </Dialog>
  );
}
