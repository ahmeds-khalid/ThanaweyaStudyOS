"use client";

import { ChevronLeft, ChevronRight, Settings2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { DayView, MonthView, WeekView } from "@/components/calendar/views";
import { Button, ButtonLink } from "@/components/app/button";
import { PageHeader } from "@/components/app/misc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { addDays, addMonths, dateFromKey, startOfMonthKey, startOfWeekKey } from "@/lib/domain/dates";
import { useToday } from "@/lib/hooks";
import { useSettings } from "@/lib/store/data";

type View = "month" | "week" | "day";

export default function CalendarPage() {
  return (
    <Suspense>
      <Calendar />
    </Suspense>
  );
}

/**
 * The calendar only shows the study plan: the weekly routine, one-off changes,
 * revisions, exams and tasks. Nothing is planned here.
 */
function Calendar() {
  const params = useSearchParams();
  const settings = useSettings();
  const today = useToday();
  const lang = settings.general.language === "ar" ? "ar-EG" : "en-GB";
  const [view, setView] = useState<View>(() => (["month", "week", "day"].includes(params.get("view") ?? "") ? (params.get("view") as View) : "week"));
  const [anchor, setAnchor] = useState(() => params.get("date") ?? today);
  const weekStartsOn = settings.general.weekStartsOn;

  const weekStart = startOfWeekKey(anchor, weekStartsOn);
  const gridStart = startOfWeekKey(startOfMonthKey(anchor), weekStartsOn);

  const step = (dir: 1 | -1) => setAnchor(view === "month" ? addMonths(anchor, dir) : addDays(anchor, dir * (view === "week" ? 7 : 1)));
  const title =
    view === "month"
      ? dateFromKey(anchor).toLocaleDateString(lang, { month: "long", year: "numeric" })
      : view === "week"
        ? `${dateFromKey(weekStart).toLocaleDateString(lang, { day: "numeric", month: "short" })} – ${dateFromKey(addDays(weekStart, 6)).toLocaleDateString(lang, { day: "numeric", month: "short" })}`
        : dateFromKey(anchor).toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "long" });

  const openDay = (date: string) => {
    setAnchor(date);
    setView("day");
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Calendar"
        className="!mb-0"
        actions={
          <ButtonLink href="/schedule" variant="secondary">
            <Settings2 /> Weekly plan
          </ButtonLink>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" aria-label="Previous" onClick={() => step(-1)}>
            <ChevronLeft className="rtl:rotate-180" />
          </Button>
          <Button size="icon" variant="ghost" aria-label="Next" onClick={() => step(1)}>
            <ChevronRight className="rtl:rotate-180" />
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setAnchor(today)}>
            Today
          </Button>
          <h2 aria-live="polite" className="ms-2 text-base font-semibold">
            {title}
          </h2>
        </div>
        <Tabs value={view} onValueChange={(v) => setView(v as View)}>
          <TabsList>
            <TabsTrigger value="month">Month</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="day">Day</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {view === "month" && <MonthView gridStart={gridStart} month={anchor.slice(0, 7)} onOpenDay={openDay} />}
      {view === "week" && <WeekView weekStart={weekStart} onOpenDay={openDay} />}
      {view === "day" && <DayView date={anchor} />}
    </div>
  );
}
