"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/app/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
      <span className="flex size-10 items-center justify-center rounded-xl bg-danger-soft text-danger">
        <TriangleAlert className="size-5" aria-hidden />
      </span>
      <h1 className="text-lg font-semibold">Something went wrong on this page</h1>
      <p className="text-[13px] text-muted-foreground">Your saved data is safe. Try again, or go back to Today.</p>
      {error.message && <p className="font-mono text-xs text-subtle">{error.message}</p>}
      <div className="flex gap-2">
        <Button variant="primary" onClick={reset}>
          <RotateCcw /> Try again
        </Button>
        <ButtonLink href="/today">Go to Today</ButtonLink>
      </div>
    </div>
  );
}
