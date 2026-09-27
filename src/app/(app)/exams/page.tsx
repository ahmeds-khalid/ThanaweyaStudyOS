"use client";

import { GraduationCap, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { ExamForm } from "@/components/forms/forms-b";
import { SubjectBadge } from "@/components/study/cards";
import { Button } from "@/components/app/button";
import { Card } from "@/components/app/card";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog } from "@/components/app/dialog";
import { Badge, EmptyState, PageHeader } from "@/components/app/misc";
import { daysBetween } from "@/lib/domain/dates";
import { examPercentage, formatPercent } from "@/lib/domain/metrics";
import { useFmtDate, useToday } from "@/lib/hooks";
import type { Exam } from "@/lib/schemas/entities";
import { confirmAction } from "@/lib/store/confirm";
import { db, useRows } from "@/lib/store/data";

export default function ExamsPage() {
  return (
    <Suspense>
      <Exams />
    </Suspense>
  );
}

function Exams() {
  const params = useSearchParams();
  const exams = useRows("exams");
  const today = useToday();
  const fd = useFmtDate();
  const [editing, setEditing] = useState<Exam | null>(() => (params.get("open") ? (db.get("exams", params.get("open")) ?? null) : null));
  const [adding, setAdding] = useState(false);
  const sorted = useMemo(() => [...exams].sort((a, b) => b.date.localeCompare(a.date)), [exams]);
  const upcoming = sorted.filter((e) => e.achievedMarks == null && e.date >= today).reverse();
  const past = sorted.filter((e) => !(e.achievedMarks == null && e.date >= today));

  const row = (e: Exam) => {
    const pct = examPercentage(e.achievedMarks, e.totalMarks);
    const d = daysBetween(today, e.date);
    return (
      <TableRow key={e.id}>
        <TableCell className="max-w-48 truncate font-medium">{e.name}</TableCell>
        <TableCell>
          <SubjectBadge subjectId={e.subjectId} />
        </TableCell>
        <TableCell className="tabular text-muted-foreground">{fd(e.date)}</TableCell>
        <TableCell className="tabular text-end">
          {pct != null ? (
            <span>
              <span className="font-semibold">{formatPercent(pct, 0)}</span>
              <span className="ms-1.5 text-xs text-muted-foreground">
                {e.achievedMarks}/{e.totalMarks}
              </span>
            </span>
          ) : (
            <Badge tone={d < 0 ? "warning" : d <= 3 ? "accent" : "neutral"}>{d === 0 ? "Today" : d === 1 ? "Tomorrow" : d < 0 ? "No score" : `${d} days`}</Badge>
          )}
        </TableCell>
        <TableCell className="w-20 text-end">
          <Button size="icon-sm" variant="ghost" aria-label={`Edit ${e.name}`} onClick={() => setEditing(e)}>
            <Pencil />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Delete ${e.name}`}
            onClick={async () => {
              if (await confirmAction({ title: "Delete this exam?", description: e.name, confirmLabel: "Delete", destructive: true })) db.remove("exams", e.id, { label: "Exam" });
            }}
          >
            <Trash2 />
          </Button>
        </TableCell>
      </TableRow>
    );
  };

  const table = (list: Exam[]) => (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Exam</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-end">Score</TableHead>
            <TableHead className="w-20">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>{list.map(row)}</TableBody>
      </Table>
    </Card>
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/subjects">Subjects</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Exams</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <PageHeader
        title="Exams"
        className="!mb-0"
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus /> Add exam
          </Button>
        }
      />
      {exams.length === 0 ? (
        <EmptyState icon={<GraduationCap />} title="No exams yet." action={<Button onClick={() => setAdding(true)}><Plus /> Add exam</Button>} />
      ) : (
        <>
          {upcoming.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-[13px] font-semibold text-muted-foreground">Upcoming</h2>
              {table(upcoming)}
            </section>
          )}
          {past.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-[13px] font-semibold text-muted-foreground">Results</h2>
              {table(past)}
            </section>
          )}
        </>
      )}
      <Dialog
        open={adding || !!editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        title={editing ? "Edit exam" : "Add exam"}
      >
        {(adding || editing) && (
          <ExamForm
            exam={editing ?? undefined}
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
