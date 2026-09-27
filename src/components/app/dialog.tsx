"use client";

import { Dialog as ShDialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const WIDTHS = { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" };

/**
 * App dialog on shadcn's Dialog (Radix): focus trap, Esc, overlay click and
 * scroll lock come from the primitive. Header, scrolling body and an optional
 * footer are laid out here so every dialog looks the same.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: keyof typeof WIDTHS;
  className?: string;
}) {
  return (
    <ShDialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className={cn("flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-hidden p-0", WIDTHS[size], className)}
      >
        <DialogHeader className="gap-1 border-b px-5 py-4 pe-12">
          <DialogTitle className="text-[15px] leading-snug font-semibold tracking-tight">{title}</DialogTitle>
          {description ? <DialogDescription className="text-[13px]">{description}</DialogDescription> : <DialogDescription className="sr-only">{typeof title === "string" ? title : "Dialog"}</DialogDescription>}
        </DialogHeader>
        {children && <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>}
        {footer && <DialogFooter className="m-0 flex-wrap items-center justify-end gap-2 rounded-none border-t bg-muted/50 px-5 py-3">{footer}</DialogFooter>}
      </DialogContent>
    </ShDialog>
  );
}
