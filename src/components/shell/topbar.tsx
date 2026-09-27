"use client";

import { CheckSquare, GraduationCap, Moon, Plus, Settings, Sun, Timer, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Button, ButtonLink } from "@/components/app/button";
import { Menu, MenuItem } from "@/components/app/menu";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { formatCountdown } from "@/lib/domain/dates";
import { remainingMs } from "@/lib/domain/timer";
import { useNow } from "@/lib/hooks";
import { db, useSettings } from "@/lib/store/data";
import { useFocus } from "@/lib/store/focus";
import { ui } from "@/lib/store/ui";
import { cn } from "@/lib/utils";

/** Small timer indicator, visible only while a timer or session is active. */
function ActiveTimerPill() {
  const timer = useFocus((s) => s.timer);
  const stage = useFocus((s) => s.stage);
  const showRemaining = useSettings().pomodoro.showRemaining;
  const now = useNow(1000);
  if (timer.status === "idle" && stage === "idle") return null;
  const label = stage === "review" ? "Finish session" : stage === "phone" ? "Phone away" : timer.status === "paused" ? "Paused" : timer.phase === "focus" ? "Focus" : "Break";
  return (
    <Link
      href="/study"
      className={cn(
        "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium",
        timer.phase === "focus" ? "border-primary/30 bg-accent-soft text-primary" : "border-success/30 bg-success-soft text-success",
      )}
    >
      <Timer className="size-3.5" aria-hidden />
      <span>{label}</span>
      {showRemaining && timer.status === "running" && now > 0 && <span className="tabular">{formatCountdown(remainingMs(timer, now))}</span>}
    </Link>
  );
}

export function Topbar() {
  const settings = useSettings();
  const isDark = settings.general.theme === "dark" || (settings.general.theme === "system" && typeof window !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches);
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/85 px-4 backdrop-blur md:px-6">
      <SidebarTrigger className="-ms-1 hidden md:inline-flex" />
      <Separator orientation="vertical" className="hidden data-[orientation=vertical]:h-4 md:block" />
      <Link href="/" className="flex items-center gap-2 md:hidden" aria-label="Study OS home">
        <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <GraduationCap className="size-4" aria-hidden />
        </span>
      </Link>
      <div className="ms-auto flex items-center gap-1.5">
        <ActiveTimerPill />
        <Menu
          label="Add"
          variant="secondary"
          trigger={
            <>
              <Plus /> Add
            </>
          }
        >
          <MenuItem icon={<CheckSquare />} onClick={() => ui.quickAdd("task")}>
            Task
          </MenuItem>
          <MenuItem icon={<TriangleAlert />} onClick={() => ui.quickAdd("mistake")}>
            Mistake
          </MenuItem>
          <MenuItem icon={<GraduationCap />} onClick={() => ui.quickAdd("exam")}>
            Exam
          </MenuItem>
        </Menu>
        <Button variant="ghost" size="icon" onClick={() => db.updateSettings({ general: { theme: isDark ? "light" : "dark" } })} aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}>
          {isDark ? <Sun /> : <Moon />}
        </Button>
        <ButtonLink href="/settings" variant="ghost" size="icon" aria-label="Settings">
          <Settings />
        </ButtonLink>
      </div>
    </header>
  );
}
