"use client";

import { ArrowLeft, ArrowRight, GraduationCap, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/app/button";
import { Card, CardBody } from "@/components/app/card";
import { Field, Input, NumberInput, Select } from "@/components/app/form";
import { SubjectDot } from "@/components/app/misc";
import { formatMinutes, sleepDurationMinutes } from "@/lib/domain/dates";
import { WEEKDAYS_SHORT } from "@/lib/labels";
import type { Settings } from "@/lib/schemas/settings";
import { db, useSettings } from "@/lib/store/data";
import { cn, SUBJECT_COLORS } from "@/lib/utils";

interface DraftSubject {
  key: string;
  name: string;
  color: string;
  include: boolean;
  progress: number;
  weeklySessions: number;
  priority: number;
  difficulty: number;
}

/** Suggestions only — every value can be changed later in Subjects and Settings. */
const SUGGESTED: DraftSubject[] = [
  { key: "math", name: "Math", color: SUBJECT_COLORS[0], include: true, progress: 15, weeklySessions: 5, priority: 5, difficulty: 5 },
  { key: "physics", name: "Physics", color: SUBJECT_COLORS[1], include: true, progress: 15, weeklySessions: 4, priority: 4, difficulty: 4 },
  { key: "chemistry", name: "Chemistry", color: SUBJECT_COLORS[2], include: true, progress: 15, weeklySessions: 4, priority: 4, difficulty: 4 },
  { key: "arabic", name: "Arabic", color: SUBJECT_COLORS[3], include: true, progress: 15, weeklySessions: 3, priority: 3, difficulty: 3 },
  { key: "english", name: "English", color: SUBJECT_COLORS[4], include: true, progress: 15, weeklySessions: 1, priority: 1, difficulty: 2 },
];

const STEPS = ["You", "Subjects", "Routine", "Progress"] as const;

function suggestedYear() {
  const d = new Date();
  const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}/${y + 1}`;
}

export default function OnboardingPage() {
  const router = useRouter();
  const current = useSettings();
  const [step, setStep] = useState(0);
  const [s, setS] = useState<Settings>(() => ({ ...current, profile: { ...current.profile, academicYear: current.profile.academicYear || suggestedYear() } }));
  const [subjects, setSubjects] = useState<DraftSubject[]>(SUGGESTED);
  const [newSubject, setNewSubject] = useState("");

  const patch = <K extends keyof Settings>(key: K, value: Partial<Settings[K]>) => setS((prev) => ({ ...prev, [key]: { ...(prev[key] as object), ...value } }));
  const included = subjects.filter((x) => x.include && x.name.trim());
  const update = (key: string, p: Partial<DraftSubject>) => setSubjects(subjects.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const skip = () => {
    db.updateSettings({ onboardingCompleted: true });
    router.replace("/");
  };

  /** Save settings and subjects. The first plan is generated automatically on Today. */
  const finish = () => {
    db.replaceSettings({ ...s, onboardingCompleted: true });
    const existing = db.list("subjects");
    included.forEach((d, i) => {
      const match = existing.find((x) => x.name.toLowerCase() === d.name.trim().toLowerCase());
      const fields = {
        name: d.name.trim(),
        color: d.color,
        weeklySessions: d.weeklySessions,
        weeklyTargetHours: Math.round(((d.weeklySessions * s.study.blockMinutes) / 60) * 10) / 10,
        priority: d.priority,
        importance: d.priority,
        difficulty: d.difficulty,
        manualProgress: d.progress,
        order: i,
      };
      if (match) db.update("subjects", match.id, fields);
      else db.create("subjects", fields);
    });
    router.replace("/today");
  };

  const last = step === STEPS.length - 1;

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-4 py-8 md:py-14">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <GraduationCap className="size-4" aria-hidden />
          </span>
          <span className="text-sm font-semibold">Set up Study OS</span>
        </div>
        <Button variant="ghost" size="sm" onClick={skip}>
          Skip
        </Button>
      </div>

      <ol className="mb-2 flex gap-1" aria-label={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}>
        {STEPS.map((label, i) => (
          <li key={label} className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-primary" : "bg-surface-3")} title={label} />
        ))}
      </ol>
      <p className="text-xs font-medium text-muted-foreground">
        Step {step + 1} of {STEPS.length}
      </p>

      <Card className="animate-in mt-3" key={step}>
        <CardBody className="flex flex-col gap-5 p-6">
          {step === 0 && (
            <>
              <h1 className="text-xl font-semibold tracking-tight">Welcome</h1>
              <Field label="Your name">{(p) => <Input {...p} autoFocus value={s.profile.name} onChange={(e) => patch("profile", { name: e.target.value })} />}</Field>
              <Field label="Track">{(p) => <Input {...p} value={s.profile.track} onChange={(e) => patch("profile", { track: e.target.value })} placeholder="e.g. علمي رياضة" />}</Field>
              <Field label="Language">
                {(p) => (
                  <Select {...p} value={s.general.language} onChange={(e) => patch("general", { language: e.target.value as "en" | "ar" })}>
                    <option value="en">English</option>
                    <option value="ar">العربية</option>
                  </Select>
                )}
              </Field>
            </>
          )}

          {step === 1 && (
            <>
              <h1 className="text-xl font-semibold tracking-tight">Subjects</h1>
              <ul className="flex flex-col gap-2">
                {subjects.map((d) => (
                  <li key={d.key} className="flex items-center gap-3 rounded-lg border border-border p-2.5">
                    <input type="checkbox" aria-label={`Include ${d.name}`} checked={d.include} onChange={(e) => update(d.key, { include: e.target.checked })} className="size-4 accent-primary" />
                    <input type="color" aria-label={`${d.name} colour`} value={d.color} onChange={(e) => update(d.key, { color: e.target.value })} className="size-6 cursor-pointer rounded border-0 bg-transparent" />
                    <Input aria-label="Subject name" value={d.name} onChange={(e) => update(d.key, { name: e.target.value })} className="h-8 flex-1" />
                    <Button size="icon-sm" variant="ghost" aria-label={`Remove ${d.name}`} onClick={() => setSubjects(subjects.filter((x) => x.key !== d.key))}>
                      <X />
                    </Button>
                  </li>
                ))}
              </ul>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newSubject.trim()) return;
                  setSubjects([...subjects, { key: `${Date.now()}`, name: newSubject.trim(), color: SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length], include: true, progress: 0, weeklySessions: 2, priority: 3, difficulty: 3 }]);
                  setNewSubject("");
                }}
              >
                <Input aria-label="New subject" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="Add another subject" />
                <Button type="submit">
                  <Plus /> Add
                </Button>
              </form>
              <p className="text-xs text-muted-foreground">Weekly blocks and priority are already set sensibly. Change them any time in Settings → Subjects.</p>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="text-xl font-semibold tracking-tight">Your routine</h1>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Wake time">{(p) => <Input {...p} type="time" value={s.sleep.wakeTime} onChange={(e) => e.target.value && patch("sleep", { wakeTime: e.target.value })} />}</Field>
                <Field label="Bedtime" hint={`${formatMinutes(sleepDurationMinutes(s.sleep.bedtime, s.sleep.wakeTime))} of sleep`}>
                  {(p) => <Input {...p} type="time" value={s.sleep.bedtime} onChange={(e) => e.target.value && patch("sleep", { bedtime: e.target.value })} />}
                </Field>
                <Field label="Study from">{(p) => <Input {...p} type="time" value={s.study.windowStart} onChange={(e) => e.target.value && patch("study", { windowStart: e.target.value })} />}</Field>
                <Field label="Study until">{(p) => <Input {...p} type="time" value={s.study.windowEnd} onChange={(e) => e.target.value && patch("study", { windowEnd: e.target.value })} />}</Field>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-[13px] font-medium">Study days</span>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Study days">
                  {WEEKDAYS_SHORT.map((d, i) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={s.study.studyDays.includes(i)}
                      onClick={() =>
                        patch("study", {
                          studyDays: s.study.studyDays.includes(i) ? s.study.studyDays.filter((x) => x !== i) : [...s.study.studyDays, i],
                        })
                      }
                      className={cn("h-8 rounded-lg border px-3 text-xs font-medium", s.study.studyDays.includes(i) ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-surface-2")}
                    >
                      {d}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Friday is set aside for catch-up by default. You can change this in Settings → Study.</p>
              </div>
              <Field label="Daily study target (minutes)" hint="Focused study per day. The plan starts lighter and builds up.">
                {(p) => <NumberInput {...p} min={30} max={960} value={s.study.dailyTargetMinutes} onChange={(v) => patch("study", { dailyTargetMinutes: Math.round(v ?? 300) })} />}
              </Field>
            </>
          )}

          {step === 3 && (
            <>
              <h1 className="text-xl font-semibold tracking-tight">Where are you now?</h1>
              <p className="text-[13px] text-muted-foreground">A rough estimate of how much of each subject you&apos;ve finished. It&apos;s replaced by exact numbers as you add and complete lessons.</p>
              {included.map((d) => (
                <div key={d.key} className="flex items-center gap-3">
                  <SubjectDot color={d.color} />
                  <label htmlFor={`progress-${d.key}`} className="w-24 truncate text-[13px] font-medium">
                    {d.name}
                  </label>
                  <input id={`progress-${d.key}`} type="range" min={0} max={100} step={5} value={d.progress} onChange={(e) => update(d.key, { progress: Number(e.target.value) })} className="flex-1 accent-primary" />
                  <span className="tabular w-10 text-end text-[13px]">{d.progress}%</span>
                </div>
              ))}
            </>
          )}
        </CardBody>
      </Card>

      <div className="mt-5 flex items-center justify-between">
        <Button variant="ghost" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
          <ArrowLeft className="rtl:rotate-180" /> Back
        </Button>
        <Button variant="primary" size="lg" onClick={last ? finish : () => setStep(step + 1)} disabled={step === 1 && included.length === 0}>
          {last ? "Create my plan" : "Continue"} <ArrowRight className="rtl:rotate-180" />
        </Button>
      </div>
    </div>
  );
}
