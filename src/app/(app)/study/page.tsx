"use client";

import { ArrowRight, Brain, Pause, Play, Smartphone, Square, TriangleAlert, X, Eye, RefreshCcw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { LessonSelect, SubjectSelect } from "@/components/forms/common";
import { MistakeForm } from "@/components/forms/forms-a";
import { ScheduleRevisionDialog } from "@/components/study/schedule-revision";
import { ThoughtRow } from "@/components/study/thought-list";
import { TimerDisplay } from "@/components/study/timer-display";
import { Button } from "@/components/app/button";
import { Card, CardBody } from "@/components/app/card";
import { Dialog } from "@/components/app/dialog";
import { Checkbox, Field, NumberInput, SegmentedControl, Select, StarInput, Switch, Textarea } from "@/components/app/form";
import { SubjectDot } from "@/components/app/misc";
import { completeLesson } from "@/lib/actions";
import { accuracy, formatPercent } from "@/lib/domain/metrics";
import { activityLabel } from "@/lib/domain/scheduler";
import { useNow } from "@/lib/hooks";
import { useT } from "@/lib/i18n";
import { ACTIVITY_LABELS, options } from "@/lib/labels";
import type { ActivityType } from "@/lib/schemas/entities";
import { confirmAction } from "@/lib/store/confirm";
import { db, useRow, useRows, useSettings } from "@/lib/store/data";
import {
  beginSession,
  cancelPending,
  closeSession,
  confirmPhoneAway,
  discardSession,
  finishSession,
  sessionActiveMs,
  toggleTimer,
  useFocus,
  type PresetKey,
} from "@/lib/store/focus";
import { toast } from "@/lib/store/toast";
import { enterFullscreen, ui, useUi } from "@/lib/store/ui";
import { cn } from "@/lib/utils";

export default function StudyPage() {
  return (
    <Suspense>
      <StudyFlow />
    </Suspense>
  );
}

function StudyFlow() {
  const stage = useFocus((s) => s.stage);
  if (stage === "phone") return <PhoneAway />;
  if (stage === "running") return <Running />;
  if (stage === "review") return <Review />;
  return <Setup />;
}

/* ------------------------------------------------------------------ */
/* 1. Setup: subject, lesson, activity, duration → START STUDY          */
/* ------------------------------------------------------------------ */

function Setup() {
  const params = useSearchParams();
  const settings = useSettings();
  const block = useRow("scheduleBlocks", params.get("block"));
  const lessonParam = useRow("lessons", params.get("lesson"));
  const p = settings.pomodoro;

  const [subjectId, setSubjectId] = useState<string | null>(block?.subjectId ?? lessonParam?.subjectId ?? params.get("subject"));
  const [lessonId, setLessonId] = useState<string | null>(block?.lessonId ?? lessonParam?.id ?? null);
  const [activity, setActivity] = useState<ActivityType>(block?.activity ?? (params.get("activity") as ActivityType) ?? "practice");
  const [planned, setPlanned] = useState<number | null>(block?.durationMinutes ?? settings.study.blockMinutes);
  const [preset, setPreset] = useState<PresetKey>(p.preset);
  const [phoneAway, setPhoneAway] = useState(settings.focus.phoneAwayPrompt);
  const [focusMode, setFocusMode] = useState(settings.focus.focusModeByDefault);

  const start = () => {
    const subject = db.get("subjects", subjectId);
    const lesson = db.get("lessons", lessonId);
    const title = block?.title || [subject?.name, lesson?.title, activityLabel(activity)].filter(Boolean).join(" — ") || "Study session";
    beginSession({ subjectId, lessonId, blockId: block?.id ?? null, activity, title, plannedMinutes: planned, preset, phoneAway, focusMode });
  };

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-semibold tracking-tight">Study</h1>
      <Card className="mt-6">
        <CardBody className="flex flex-col gap-5">
          <Field label="Subject">
            {(f) => (
              <SubjectSelect
                {...f}
                value={subjectId}
                allowNone={false}
                onChange={(v) => {
                  setSubjectId(v);
                  setLessonId(null);
                }}
              />
            )}
          </Field>
          <Field label="Lesson">{(f) => <LessonSelect {...f} subjectId={subjectId} value={lessonId} onChange={setLessonId} />}</Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Activity">
              {(f) => (
                <Select {...f} value={activity} onChange={(e) => setActivity(e.target.value as ActivityType)}>
                  {options(ACTIVITY_LABELS).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Duration (min)">{(f) => <NumberInput {...f} allowEmpty min={5} max={600} value={planned} onChange={setPlanned} placeholder="open" />}</Field>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-medium">Timer</span>
            <SegmentedControl
              label="Pomodoro preset"
              value={preset}
              onChange={setPreset}
              className="flex-wrap"
              options={[
                { value: "classic", label: "25/5" },
                { value: "deep", label: "50/10" },
                { value: "long", label: "90/15" },
                { value: "custom", label: `Custom ${p.focusMinutes}/${p.shortBreakMinutes}` },
              ]}
            />
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-[13px] text-muted-foreground">
            <label className="flex items-center gap-2">
              <Switch checked={focusMode} onChange={setFocusMode} label="Focus mode" /> <Eye className="size-4" aria-hidden /> Focus mode
            </label>
            <label className="flex items-center gap-2">
              <Switch checked={phoneAway} onChange={setPhoneAway} label="Phone away" /> <Smartphone className="size-4" aria-hidden /> Phone away
            </label>
          </div>
          <Button variant="primary" size="lg" className="h-12 text-base" onClick={start} disabled={!subjectId && !lessonId}>
            <Play /> START STUDY
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Phone away                                                        */
/* ------------------------------------------------------------------ */

function PhoneAway() {
  const t = useT();
  const settings = useSettings();
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <span className="flex size-16 items-center justify-center rounded-3xl bg-accent-soft text-primary">
        <Smartphone className="size-8" aria-hidden />
      </span>
      <div>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t("focus.phoneAway").toUpperCase()}</h1>
        <p className="mt-3 text-lg text-muted-foreground">{t("focus.phoneAwayBody")}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          variant="primary"
          size="lg"
          className="h-12 px-8 text-base"
          autoFocus
          onClick={() => {
            if (settings.pomodoro.fullscreen) void enterFullscreen();
            confirmPhoneAway();
          }}
        >
          Phone is away — start <ArrowRight className="rtl:rotate-180" />
        </Button>
        <Button size="lg" className="h-12" onClick={cancelPending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Running: only timer, subject, lesson, pause, finish, thought      */
/* ------------------------------------------------------------------ */

function Running() {
  const t = useT();
  const settings = useSettings();
  const timer = useFocus((s) => s.timer);
  const session = useFocus((s) => s.session);
  const focusState = useFocus();
  const focusMode = useUi((s) => s.focusMode);
  const now = useNow(1000);
  const subject = useRow("subjects", session?.subjectId);
  const lesson = useRow("lessons", session?.lessonId);

  // Esc leaves focus mode (the session keeps running).
  useEffect(() => {
    if (!focusMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[role=dialog]")) ui.setFocusMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusMode]);

  if (!session) return null;

  const finish = async () => {
    // A start that lasted under a minute isn't worth saving.
    if (sessionActiveMs(focusState, Date.now()) < 60_000) {
      discardSession();
      toast.show("Session was under a minute, so it wasn't saved");
      return;
    }
    if (await confirmAction({ title: "Finish this session?", description: "You'll log how it went next.", confirmLabel: "Finish" })) finishSession();
  };

  return (
    <div className={cn("flex flex-col items-center gap-8", focusMode ? "min-h-dvh justify-center px-4 py-10" : "py-8")}>
      <div className="fixed top-3 end-3 flex gap-1">
        <Button size="sm" variant="ghost" onClick={() => (focusMode ? ui.setFocusMode(false) : ui.setFocusMode(true))}>
          {focusMode ? (
            <>
              <X /> {t("focus.exitFocus")}
            </>
          ) : (
            <>
              <Eye /> {t("focus.focusMode")}
            </>
          )}
        </Button>
      </div>
      <div className="text-center">
        <p className="flex items-center justify-center gap-2 text-[13px] text-muted-foreground">
          {subject && <SubjectDot color={subject.color} />}
          {subject?.name ?? "Study"} · {ACTIVITY_LABELS[session.activity]}
        </p>
        <h1 className="mt-1 max-w-2xl text-xl font-semibold tracking-tight md:text-2xl">{lesson?.title ?? session.title}</h1>
      </div>

      <TimerDisplay timer={timer} now={now} style={settings.pomodoro.timerStyle} showRemaining={settings.pomodoro.showRemaining} size={focusMode ? "xl" : "lg"} />

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant="primary" size="lg" className="h-12 min-w-36" onClick={toggleTimer}>
          {timer.status === "running" ? <Pause /> : <Play />}
          {timer.status === "running" ? t("common.pause") : timer.status === "finished" ? "Start next" : t("common.resume")}
        </Button>
        <Button size="lg" className="h-12" onClick={() => void finish()}>
          <Square /> Finish
        </Button>
        <Button size="lg" variant="ghost" className="h-12" onClick={ui.openThought}>
          <Brain /> {t("focus.captureThought")}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Session complete                                                  */
/* ------------------------------------------------------------------ */

function Review() {
  const router = useRouter();
  const session = useFocus((s) => s.session);
  const row = useRow("studySessions", session?.sessionId);
  const subject = useRow("subjects", session?.subjectId);
  const lesson = useRow("lessons", session?.lessonId);
  const thoughts = useRows("thoughts");
  const parked = useMemo(() => thoughts.filter((x) => x.sessionId === session?.sessionId && x.status === "parked"), [thoughts, session]);

  const [focused, setFocused] = useState<number>(row?.focusedMinutes ?? 0);
  const [attempted, setAttempted] = useState<number>(row?.questionsAttempted ?? 0);
  const [correct, setCorrect] = useState<number>(row?.questionsCorrect ?? 0);
  const [focusRating, setFocusRating] = useState<number | null>(row?.focusRating ?? null);
  const [difficulty, setDifficulty] = useState<number | null>(row?.difficultyRating ?? null);
  const [confidence, setConfidence] = useState<number | null>(row?.confidence ?? null);
  const [notes, setNotes] = useState(row?.notes ?? "");
  const [lessonDone, setLessonDone] = useState(false);
  const [mistakeOpen, setMistakeOpen] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [afterRevision, setAfterRevision] = useState(false);

  if (!session || !row) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted-foreground">This session is no longer available.</p>
        <Button className="mt-4" onClick={closeSession}>
          Close
        </Button>
      </div>
    );
  }

  const acc = accuracy(correct, attempted);
  const leave = () => {
    closeSession();
    router.push("/today");
  };

  const save = () => {
    if (correct > attempted) return toast.error("Correct can't be more than attempted");
    try {
      const minutes = Math.max(0, Math.min(Math.round(focused), 1440));
      db.update("studySessions", row.id, {
        focusedMinutes: minutes,
        // Manually raised focus time can't exceed the session length.
        actualMinutes: Math.max(row.actualMinutes, minutes),
        questionsAttempted: attempted,
        questionsCorrect: correct,
        focusRating,
        difficultyRating: difficulty,
        confidence,
        notes,
        status: "completed",
      });
      if (lesson) {
        const patch: Record<string, unknown> = {
          questionsAttempted: lesson.questionsAttempted + attempted,
          questionsCorrect: lesson.questionsCorrect + correct,
        };
        if (session.activity === "explanation") patch.explanationMinutes = lesson.explanationMinutes + minutes;
        if (session.activity === "practice") {
          patch.practiceMinutes = lesson.practiceMinutes + minutes;
          if (lesson.status === "learning" || lesson.status === "not_started") patch.status = "practicing";
        }
        db.update("lessons", lesson.id, patch);
        if (lessonDone) completeLesson(lesson);
      }
      if (lessonDone && lesson && db.settings().revision.askOnLessonComplete) {
        setAfterRevision(true);
        setRevisionOpen(true);
        return;
      }
      leave();
    } catch {
      /* toast shown */
    }
  };

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-5">
      <div>
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
          {subject && <SubjectDot color={subject.color} />} Session complete
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">{lesson?.title ?? session.title}</h1>
      </div>

      <Card>
        <CardBody className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Focused (min)">{(f) => <NumberInput {...f} min={0} max={1440} value={focused} onChange={(v) => setFocused(v ?? 0)} />}</Field>
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium">Accuracy</span>
              <span className="tabular flex h-9 items-center text-xl font-semibold">{formatPercent(acc)}</span>
            </div>
            <Field label="Questions">{(f) => <NumberInput {...f} min={0} value={attempted} onChange={(v) => setAttempted(Math.round(v ?? 0))} />}</Field>
            <Field label="Correct">{(f) => <NumberInput {...f} min={0} value={correct} onChange={(v) => setCorrect(Math.round(v ?? 0))} />}</Field>
          </div>
          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium">Focus</span>
              <StarInput value={focusRating} onChange={setFocusRating} label="Focus" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium">Difficulty</span>
              <StarInput value={difficulty} onChange={setDifficulty} label="Difficulty" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium">Confidence</span>
              <StarInput value={confidence} onChange={setConfidence} label="Confidence" />
            </div>
          </div>
          <Field label="Notes">{(f) => <Textarea {...f} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
          {lesson && lesson.status !== "completed" && <Checkbox checked={lessonDone} onChange={setLessonDone} label={`Mark “${lesson.title}” complete`} />}
        </CardBody>
      </Card>

      {parked.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-[13px] font-semibold text-muted-foreground">Thoughts you captured</h2>
          <ul className="flex flex-col gap-2">
            {parked.map((th) => (
              <ThoughtRow key={th.id} thought={th} />
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="lg" onClick={save}>
          Save
        </Button>
        <Button variant="ghost" onClick={() => setMistakeOpen(true)}>
          <TriangleAlert /> Add mistake
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setAfterRevision(false);
            if (lesson) setRevisionOpen(true);
            else ui.quickAdd("revision", { subjectId: session.subjectId });
          }}
        >
          <RefreshCcw /> Schedule revision
        </Button>
      </div>

      <Dialog open={mistakeOpen} onClose={() => setMistakeOpen(false)} title="Add mistake" size="lg">
        {mistakeOpen && <MistakeForm defaults={{ subjectId: session.subjectId, lessonId: session.lessonId }} onDone={() => setMistakeOpen(false)} />}
      </Dialog>
      <ScheduleRevisionDialog
        lesson={lesson ?? null}
        open={revisionOpen}
        onClose={() => {
          setRevisionOpen(false);
          if (afterRevision) leave();
        }}
      />
    </div>
  );
}
