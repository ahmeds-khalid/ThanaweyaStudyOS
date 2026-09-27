"use client";

import { FileUp, GraduationCap } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/app/button";
import { Dialog } from "@/components/app/dialog";
import { Callout } from "@/components/app/misc";
import { parseCurriculumText, planCurriculumImport, type CurriculumImportPlan } from "@/lib/domain/curriculum-import";
import { useCurriculum, useSubjects } from "@/lib/hooks";
import { db } from "@/lib/store/data";
import { toast } from "@/lib/store/toast";
import { readFileText, SUBJECT_COLORS, uid } from "@/lib/utils";

/** The curriculum dataset shipped with the app (public/curriculum). */
const READY_MADE = {
  label: "Third Secondary · Scientific Math 2026/27",
  file: "third_secondary_scientific_math_2026_2027_curriculum.json",
  url: "/curriculum/third_secondary_scientific_math_2026_2027_curriculum.json",
};

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const curriculum = useCurriculum();
  const { all } = useSubjects();
  const fileRef = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<CurriculumImportPlan | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");

  const load = async (name: string, read: () => Promise<string>) => {
    setFileName(name);
    try {
      const text = await read();
      const parsed = parseCurriculumText(text, name);
      setErrors(parsed.errors);
      if (parsed.data.length === 0) return setPlan(null);
      setPlan(
        planCurriculumImport(parsed.data, { subjects: all, units: curriculum.units, chapters: curriculum.chapters, lessons: curriculum.lessons }, uid, {
          lessonMinutes: 60,
          subjectColor: (i) => SUBJECT_COLORS[i % SUBJECT_COLORS.length],
        }),
      );
    } catch {
      setErrors(["Could not read the file."]);
    }
  };
  const onFile = (file: File | undefined) => {
    if (file) void load(file.name, () => readFileText(file));
  };

  const apply = () => {
    if (!plan) return;
    try {
      plan.subjects.forEach(({ id, ...f }) => db.create("subjects", f, id));
      plan.units.forEach(({ id, ...f }) => db.create("units", f, id));
      plan.chapters.forEach(({ id, ...f }) => db.create("chapters", f, id));
      plan.lessons.forEach(({ id, ...f }) => db.create("lessons", f, id));
      toast.success("Curriculum imported", `${plan.lessons.length} lessons added${plan.skippedLessons ? `, ${plan.skippedLessons} duplicates skipped` : ""}.`);
      setPlan(null);
      setFileName("");
      onClose();
    } catch {
      /* toast shown */
    }
  };

  const example = useMemo(
    () =>
      JSON.stringify(
        { subject: "Physics", units: [{ name: "Unit 1", chapters: [{ name: "Chapter 1", lessons: ["Lesson title", { title: "Another lesson", estimatedMinutes: 45, topics: ["Topic A"] }] }] }] },
        null,
        2,
      ),
    [],
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Import curriculum"
      description="JSON or CSV. Existing subjects, units, chapters and lessons are matched by name, so re-importing never duplicates."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!plan || errors.length > 0 || (plan.lessons.length === 0 && plan.units.length === 0)} onClick={apply}>
            Import
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-[13px]">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => fileRef.current?.click()}>
            <FileUp /> Choose file
          </Button>
          <Button onClick={() => void load(READY_MADE.file, async () => (await fetch(READY_MADE.url)).text())}>
            <GraduationCap /> {READY_MADE.label}
          </Button>
          <input ref={fileRef} type="file" accept=".json,.csv,application/json,text/csv" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
        </div>
        <p className="truncate text-muted-foreground">{fileName || "No file selected"}</p>
        {errors.length > 0 && (
          <Callout tone="danger" title="The file has problems — nothing was imported">
            <ul className="list-disc ps-4">
              {errors.slice(0, 8).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Callout>
        )}
        {plan && errors.length === 0 && (
          <Callout tone="info" title="Ready to import">
            {plan.subjects.length} new subjects, {plan.units.length} units, {plan.chapters.length} chapters, {plan.lessons.length} lessons
            {plan.skippedLessons ? ` (${plan.skippedLessons} existing lessons skipped)` : ""}.
          </Callout>
        )}
        <Accordion type="single" collapsible>
  <AccordionItem value="x" className="border-none">
    <AccordionTrigger className="py-1 text-[13px] text-muted-foreground hover:no-underline">File format</AccordionTrigger>
    <AccordionContent>
          <p className="mt-2 text-muted-foreground">JSON (one subject or an array):</p>
          <pre className="mt-1 overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-xs">{example}</pre>
          <p className="mt-2 text-muted-foreground">CSV header:</p>
          <pre className="mt-1 overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-xs">subject,unit,chapter,lesson,estimated_minutes,difficulty,teacher,video_url,description,topics</pre>
          <p className="mt-1 text-xs text-muted-foreground">Topics are separated with semicolons.</p>
        </AccordionContent>
  </AccordionItem>
</Accordion>
      </div>
    </Dialog>
  );
}
