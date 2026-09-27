"use client";

import { DatabaseZap } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { ExamForm, LessonForm } from "@/components/forms/forms-b";
import { MistakeForm, RevisionForm, TaskForm } from "@/components/forms/forms-a";
import { Button } from "@/components/app/button";
import { Dialog } from "@/components/app/dialog";
import { useMounted } from "@/lib/hooks";
import { retryLoad, useDataStore } from "@/lib/store/data";
import { ui, useUi, type QuickAddKind } from "@/lib/store/ui";
import { cn } from "@/lib/utils";
import { AutoPlanner, Bootstrap, NotificationEngine, TimerEngine } from "./engines";
import { Toaster } from "@/components/ui/sonner";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmDialog, ThoughtCapture } from "./overlays";
import { AppSidebar, MobileNav } from "./sidebar";
import { Topbar } from "./topbar";

const QUICK_TITLES: Record<QuickAddKind, string> = {
  task: "Add task",
  mistake: "Log a mistake",
  exam: "Add exam",
  revision: "Schedule revision",
  lesson: "Add lesson",
};

function QuickAddHost() {
  const quick = useUi((s) => s.quickAdd);
  const close = ui.closeQuickAdd;
  const d = quick?.defaults as never;
  return (
    <Dialog open={!!quick} onClose={close} title={quick ? QUICK_TITLES[quick.kind] : ""} size="lg">
      {quick?.kind === "task" && <TaskForm defaults={d} onDone={close} />}
      {quick?.kind === "mistake" && <MistakeForm defaults={d} onDone={close} />}
      {quick?.kind === "exam" && <ExamForm defaults={d} onDone={close} />}
      {quick?.kind === "lesson" && <LessonForm defaults={d} onDone={close} />}
      {quick?.kind === "revision" && <RevisionForm defaults={d} onDone={close} />}
    </Dialog>
  );
}

function LoadingScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Spinner />
        Loading your study system…
      </div>
    </div>
  );
}

function ErrorScreen({ message }: { message: string | null }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-border bg-surface p-6 text-center shadow-card">
        <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-xl bg-danger-soft text-danger">
          <DatabaseZap className="size-5" aria-hidden />
        </div>
        <h1 className="text-base font-semibold">Your data could not be loaded</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">
          The app couldn&apos;t reach its database and there is no offline copy on this device yet. Make sure the server is running
          (<code className="font-mono">npm run dev</code>) and the database is migrated (<code className="font-mono">npm run db:migrate</code>).
        </p>
        {message && <p className="mt-2 font-mono text-xs text-subtle">{message}</p>}
        <Button variant="primary" className="mt-4" onClick={() => void retryLoad()}>
          Try again
        </Button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const mounted = useMounted();
  const status = useDataStore((s) => s.status);
  const loadError = useDataStore((s) => s.loadError);
  const onboarded = useDataStore((s) => s.settings.onboardingCompleted);
  const source = useDataStore((s) => s.source);
  const focusModeOn = useUi((s) => s.focusMode);
  const pathname = usePathname();
  const focusMode = focusModeOn || pathname === "/onboarding";
  const router = useRouter();

  // First launch → setup wizard (skippable; only once the server copy is known).
  useEffect(() => {
    if (status === "ready" && source === "server" && !onboarded && pathname !== "/onboarding") router.replace("/onboarding");
  }, [status, source, onboarded, pathname, router]);

  return (
    <>
      <Bootstrap />
      {!mounted || status === "loading" ? (
        <LoadingScreen />
      ) : status === "error" ? (
        <ErrorScreen message={loadError} />
      ) : (
        <>
          <a href="#main" className="sr-only z-[70] rounded-lg bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:start-2">
            Skip to content
          </a>
          <TooltipProvider>
          <SidebarProvider>
            {!focusMode && <AppSidebar />}
            <SidebarInset id="main" className="min-w-0">
              {!focusMode && <Topbar />}
              <div
                className={cn(
                  "mx-auto w-full flex-1",
                  focusMode ? "max-w-none p-0" : "max-w-[1240px] px-4 pt-5 pb-28 md:px-6 md:pt-7 md:pb-12 lg:px-8",
                )}
              >
                {children}
              </div>
            </SidebarInset>
          </SidebarProvider>
          </TooltipProvider>
          {!focusMode && <MobileNav />}
          <TimerEngine />
          <NotificationEngine />
          <AutoPlanner />
          <ThoughtCapture />
          <QuickAddHost />
          <ConfirmDialog />
        </>
      )}
      <Toaster />
    </>
  );
}
