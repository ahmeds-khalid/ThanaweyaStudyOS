import { Card as ShCard, CardAction, CardContent, CardDescription, CardHeader as ShCardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** shadcn Card, with the app's padding scale (`--pad`, changed by compact mode). */
export function Card({ className, ...props }: React.ComponentProps<typeof ShCard>) {
  return <ShCard className={cn("gap-0 py-0 shadow-card", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <ShCardHeader className={cn("px-[var(--pad)] pt-[var(--pad)]", className)}>
      <CardTitle className="flex items-center gap-2 text-[13px] font-semibold tracking-tight">
        {icon && <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>}
        {title}
      </CardTitle>
      {description && <CardDescription className="text-xs">{description}</CardDescription>}
      {action && <CardAction className="flex items-center gap-1.5">{action}</CardAction>}
    </ShCardHeader>
  );
}

export function CardBody({ className, ...props }: React.ComponentProps<"div">) {
  return <CardContent className={cn("p-[var(--pad)]", className)} {...props} />;
}

export function Stat({ label, value, hint, className }: { label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div className="tabular mt-1 text-xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
