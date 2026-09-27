"use client";

import { ArrowRight, Play } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { ButtonLink } from "@/components/app/button";
import { Card, CardBody, CardHeader } from "@/components/app/card";
import { Badge, SubjectDot } from "@/components/app/misc";
import { subjectProgress } from "@/lib/domain/curriculum";
import { addDays, formatClock, formatMinutes } from "@/lib/domain/dates";
import { useCurriculum, useFmtDate, useNow, useSubjects, useToday } from "@/lib/hooks";
import { useT } from "@/lib/i18n";
import { ACTIVITY_LABELS } from "@/lib/labels";
import { nextBlock } from "@/lib/selectors";
import { useRows, useSettings } from "@/lib/store/data";
import { useFocus } from "@/lib/store/focus";

/** "Next study session" with a one-click START. */
export function NextSessionCard() {
  const t = useT();
  const blocks = useRows("scheduleBlocks");
  const today = useToday();
  const now = useNow(30_000);
  const settings = useSettings();
  const fd = useFmtDate();
  const { active, byId } = useSubjects();
  const curriculum = useCurriculum();
  const stage = useFocus((s) => s.stage);
  const session = useFocus((s) => s.session);

  const block = useMemo(() => nextBlock(blocks, today, now), [blocks, today, now]);

  // With nothing planned, suggest the next lesson of the highest-priority subject.
  const suggestion = useMemo(() => {
    if (block) return null;
    const subject = [...active].sort((a, b) => b.priority - a.priority)[0];
    if (!subject) return null;
    return { subject, lesson: subjectProgress(subject, curriculum).nextLesson };
  }, [block, active, curriculum]);

  if (session && stage !== "idle") {
    return (
      <Card className="h-full border-primary/40">
        <CardHeader title={t("dashboard.nextSession")} />
        <CardBody className="flex flex-col gap-3">
          <p className="text-base font-semibold">{session.title || "Study session"}</p>
          <ButtonLink href="/study" variant="primary" size="lg" className="w-fit">
            Return to session <ArrowRight className="rtl:rotate-180" />
          </ButtonLink>
        </CardBody>
      </Card>
    );
  }

  const subject = block ? byId.get(block.subjectId ?? "") : suggestion?.subject;
  const when = block ? (block.date === today ? "Today" : block.date === addDays(today, 1) ? "Tomorrow" : fd(block.date)) : null;
  return (
    <Card className="h-full">
      <CardHeader title={t("dashboard.nextSession")} />
      <CardBody className="flex flex-col gap-4">
        {block || suggestion ? (
          <div className="flex items-start gap-3">
            <SubjectDot color={subject?.color} className="mt-2 size-2.5" />
            <div className="min-w-0">
              <p className="text-base leading-snug font-semibold">
                {block ? block.title || subject?.name : `${suggestion!.subject.name}${suggestion!.lesson ? ` — ${suggestion!.lesson.title}` : ""}`}
              </p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {block
                  ? `${when} · ${formatClock(block.start, settings.general.timeFormat)} · ${formatMinutes(block.durationMinutes)}${block.activity ? ` · ${ACTIVITY_LABELS[block.activity]}` : ""}`
                  : "Nothing planned — this is your highest-priority subject."}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">Add your subjects to get a plan.</p>
        )}
        {block ? (
          <ButtonLink href={`/study?block=${block.id}`} variant="primary" size="lg" className="w-fit">
            <Play /> START
          </ButtonLink>
        ) : suggestion ? (
          <ButtonLink href={`/study?subject=${suggestion.subject.id}${suggestion.lesson ? `&lesson=${suggestion.lesson.id}` : ""}`} variant="primary" size="lg" className="w-fit">
            <Play /> START
          </ButtonLink>
        ) : (
          <ButtonLink href="/subjects" variant="primary" className="w-fit">
            Add subjects
          </ButtonLink>
        )}
      </CardBody>
    </Card>
  );
}

export function SubjectBadge({ subjectId }: { subjectId: string | null }) {
  const { byId } = useSubjects();
  const s = subjectId ? byId.get(subjectId) : undefined;
  if (!s) return null;
  return (
    <Badge>
      <SubjectDot color={s.color} className="size-1.5" /> {s.name}
    </Badge>
  );
}

export function SeeAll({ href, label = "See all" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
      {label} <ArrowRight className="size-3 rtl:rotate-180" aria-hidden />
    </Link>
  );
}
