"use client";

import Link from "next/link";
import { useMemo } from "react";
import { NextSessionCard, SeeAll } from "@/components/study/cards";
import { Card, CardBody, CardHeader, Stat } from "@/components/app/card";
import { EmptyState, ProgressBar, SubjectDot } from "@/components/app/misc";
import { ButtonLink } from "@/components/app/button";
import { computeAnalytics } from "@/lib/domain/analytics";
import { subjectProgress } from "@/lib/domain/curriculum";
import { addDays, dateFromKey, formatMinutes, greetingFor, startOfWeekKey } from "@/lib/domain/dates";
import { formatPercent } from "@/lib/domain/metrics";
import { useCurriculum, useNow, useSubjects, useToday } from "@/lib/hooks";
import { useT } from "@/lib/i18n";
import { useDayStats } from "@/lib/selectors";
import { useRows, useSettings } from "@/lib/store/data";

/** Dashboard: five calm sections. Nothing to configure here. */
export default function DashboardPage() {
  const t = useT();
  const settings = useSettings();
  const now = useNow(60_000);
  const today = useToday();
  const name = settings.profile.name;
  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <header>
        <p className="text-[13px] text-muted-foreground">
          {dateFromKey(today).toLocaleDateString(settings.general.language === "ar" ? "ar-EG" : "en-GB", { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-[28px]">
          {t(`greeting.${greetingFor(new Date(now).getHours())}`)}
          {name ? `, ${name}` : ""}
        </h1>
      </header>
      <div className="grid gap-[var(--gap)] md:grid-cols-2">
        <TodayCard />
        <NextSessionCard />
      </div>
      <div className="grid gap-[var(--gap)] md:grid-cols-2">
        <CurriculumCard />
        <div className="flex flex-col gap-[var(--gap)]">
          <RevisionCard />
          <WeekCard />
        </div>
      </div>
    </div>
  );
}

function TodayCard() {
  const today = useToday();
  const s = useDayStats(today);
  const goal = s.plannedMinutes || s.targetMinutes;
  return (
    <Card className="h-full">
      <CardHeader title="Today" action={<SeeAll href="/today" label="Open" />} />
      <CardBody>
        <div className="tabular text-3xl font-semibold tracking-tight">
          {formatMinutes(s.focusedMinutes)} <span className="text-lg font-normal text-muted-foreground">/ {formatMinutes(goal)}</span>
        </div>
        <ProgressBar value={s.percent} className="mt-3" label="Today's progress" />
        <p className="mt-2 text-[13px] text-muted-foreground">
          {s.plannedBlocks > 0 ? `${s.completedBlocks} of ${s.plannedBlocks} study blocks done` : "No study blocks planned today"}
        </p>
      </CardBody>
    </Card>
  );
}

function CurriculumCard() {
  const { active } = useSubjects();
  const curriculum = useCurriculum();
  const progress = useMemo(() => active.map((s) => ({ s, p: subjectProgress(s, curriculum) })), [active, curriculum]);
  return (
    <Card className="h-full">
      <CardHeader title="Curriculum" action={<SeeAll href="/subjects" label="Subjects" />} />
      <CardBody>
        {progress.length === 0 ? (
          <EmptyState compact title="Add your first subject." action={<ButtonLink href="/subjects" size="sm" variant="primary">Add subject</ButtonLink>} />
        ) : (
          <ul className="flex flex-col gap-3">
            {progress.map(({ s, p }) => (
              <li key={s.id}>
                <Link href={`/subjects/${s.id}`} className="group block">
                  <div className="flex items-center gap-2 text-[13px]">
                    <SubjectDot color={s.color} />
                    <span className="font-medium group-hover:underline">{s.name}</span>
                    <span className="tabular ms-auto text-muted-foreground">{formatPercent(p.percent, 0)}</span>
                  </div>
                  <ProgressBar value={p.percent} color={s.color} size="sm" className="mt-1.5" label={`${s.name} progress`} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function RevisionCard() {
  const revisions = useRows("revisions");
  const today = useToday();
  const dueToday = revisions.filter((r) => r.status === "pending" && r.scheduledDate === today).length;
  const overdue = revisions.filter((r) => r.status === "pending" && r.scheduledDate < today).length;
  return (
    <Card>
      <CardHeader title="Revision" action={<SeeAll href="/revision" label="Open" />} />
      <CardBody className="flex gap-8">
        <Stat label="Due today" value={dueToday} />
        <Stat label="Overdue" value={overdue} />
      </CardBody>
    </Card>
  );
}

function WeekCard() {
  const settings = useSettings();
  const today = useToday();
  const subjects = useRows("subjects");
  const sessions = useRows("studySessions");
  const blocks = useRows("scheduleBlocks");
  const questionSets = useRows("questionSets");
  const exams = useRows("exams");
  const revisions = useRows("revisions");
  const lessons = useRows("lessons");
  const pomodoros = useRows("pomodoroSessions");
  const start = startOfWeekKey(today, settings.general.weekStartsOn);
  const a = useMemo(
    () => computeAnalytics({ settings, subjects, sessions, blocks, questionSets, exams, revisions, lessons, pomodoros, start, end: addDays(start, 6), today }),
    [settings, subjects, sessions, blocks, questionSets, exams, revisions, lessons, pomodoros, start, today],
  );
  return (
    <Card>
      <CardHeader title="This week" />
      <CardBody className="grid grid-cols-2 gap-5">
        <Stat label="Focused" value={formatMinutes(a.focusedMinutes)} />
        <Stat label="Lessons" value={a.lessonsCompleted} />
        <Stat label="Questions" value={a.questions.attempted} />
        <Stat label="Study days" value={a.studyDays} />
      </CardBody>
    </Card>
  );
}
