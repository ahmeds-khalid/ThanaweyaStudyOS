"use client";

import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/app/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/**
 * Dropdown menu on shadcn's DropdownMenu. Pass `trigger` for a labelled button,
 * otherwise a "…" icon button is used. It is non-modal so a menu item can open
 * a dialog without the page being left unclickable.
 */
export function Menu({
  children,
  label,
  trigger,
  variant = "ghost",
  align = "end",
}: {
  children: React.ReactNode;
  label: string;
  trigger?: React.ReactNode;
  variant?: "ghost" | "secondary" | "primary";
  align?: "start" | "end";
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        {trigger ? (
          <Button size="sm" variant={variant} aria-label={label}>
            {trigger}
          </Button>
        ) : (
          <Button size="icon-sm" variant="ghost" aria-label={label}>
            <MoreHorizontal />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-48">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function MenuItem({ icon, children, onClick, danger }: { icon?: React.ReactNode; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <DropdownMenuItem variant={danger ? "destructive" : "default"} onSelect={onClick}>
      {icon}
      {children}
    </DropdownMenuItem>
  );
}
