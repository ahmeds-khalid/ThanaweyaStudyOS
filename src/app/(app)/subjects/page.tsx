"use client";

import { ArrowRight, BookMarked, FileUp, GraduationCap, Plus } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ImportDialog } from "@/components/study/import-dialog";
import { SubjectForm } from "@/components/forms/subject-form";
import { SubjectIcon } from "@/components/subject-icon";
import { Button, ButtonLink } from "@/components/app/button";
import { Card, CardBody } from "@/components/app/card";
import { Dialog } from "@/components/app/dialog";
import { EmptyState, PageHeader, ProgressBar } from "@/components/app/misc";
import { subjectProgress } from "@/lib/domain/curriculum";
import { formatPercent } from "@/lib/domain/metrics";
import { useCurriculum, useSubjects } from "@/lib/hooks";
import { db } from "@/lib/store/data";

export default function SubjectsPage() {
  const router = useRouter();
  const { all } = useSubjects();
  const curriculum = useCurriculum();
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const live = all.filter((s) => !s.archived);
  const archived = all.filter((s) => s.archived);

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <PageHeader
        title="Subjects"
        actions={
          <>
            <ButtonLink href="/exams" variant="ghost">
              <GraduationCap /> Exams
            </ButtonLink>
            <Button variant="ghost" onClick={() => setImporting(true)}>
              <FileUp /> Import
            </Button>
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus /> Add subject
            </Button>
          </>
        }
      />
      {live.length === 0 ? (
        <EmptyState icon={<BookMarked />} title="Add your first subject." action={<Button variant="primary" onClick={() => setAdding(true)}><Plus /> Add subject</Button>} />
      ) : (
        <div className="grid gap-[var(--gap)] md:grid-cols-2 xl:grid-cols-3">
          {live.map((s) => {
            const p = subjectProgress(s, curriculum);
            return (
              <Link key={s.id} href={`/subjects/${s.id}`} className="group block rounded-[var(--radius)] focus-visible:outline-2">
                <Card className="h-full transition-colors group-hover:border-border-strong">
                  <CardBody className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in oklab, ${s.color} 18%, transparent)` }}>
                        <SubjectIcon name={s.icon} color={s.color} className="size-4" />
                      </span>
                      <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{s.name}</h2>
                      <span className="tabular text-sm font-medium">{formatPercent(p.percent, 0)}</span>
                      <ArrowRight className="size-4 text-subtle rtl:rotate-180" aria-hidden />
                    </div>
                    <ProgressBar value={p.percent} color={s.color} label={`${s.name} progress`} />
                    <p className="truncate text-xs text-muted-foreground">
                      {p.estimated ? "Add lessons to track exact progress" : p.nextLesson ? `Next: ${p.nextLesson.title}` : "All lessons complete"}
                    </p>
                  </CardBody>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
      {archived.length > 0 && (
        <Accordion type="single" collapsible>
  <AccordionItem value="x" className="border-none">
    <AccordionTrigger className="py-1 text-[13px] text-muted-foreground hover:no-underline">Archived ({archived.length})</AccordionTrigger>
    <AccordionContent>
          <ul className="mt-2 flex flex-col gap-1">
            {archived.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <span>{s.name}</span>
                <Button size="xs" variant="ghost" onClick={() => db.update("subjects", s.id, { archived: false })}>
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </AccordionContent>
  </AccordionItem>
</Accordion>
      )}
      <ImportDialog open={importing} onClose={() => setImporting(false)} />
      <Dialog open={adding} onClose={() => setAdding(false)} title="Add subject" size="lg">
        {adding && (
          <SubjectForm
            count={all.length}
            onDone={(created) => {
              setAdding(false);
              if (created) router.push(`/subjects/${created.id}`);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}
