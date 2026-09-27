import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge as ShBadge } from "@/components/ui/badge";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";


type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const TONES: Record<Tone, string> = {
  neutral: "",
  accent: "bg-primary/10 text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

/** shadcn Badge with the app's status tones. */
export function Badge({ tone = "neutral", className, children, ...props }: { tone?: Tone } & React.ComponentProps<"span">) {
  return (
    <ShBadge variant={tone === "neutral" ? "secondary" : "outline"} className={cn("border-transparent", TONES[tone], className)} {...props}>
      {children}
    </ShBadge>
  );
}

export function DemoBadge() {
  return (
    <Badge tone="warning" title="Sample data — not your real progress">
      Demo
    </Badge>
  );
}

/** shadcn Progress, optionally in a subject colour. */
export function ProgressBar({ value, max = 100, color, className, label, size = "md" }: { value: number; max?: number; color?: string; className?: string; label?: string; size?: "sm" | "md" }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return <Progress value={pct} indicatorColor={color} aria-label={label} className={cn(size === "sm" ? "h-1.5" : "h-2", className)} />;
}

export function ProgressRing({
  value,
  size = 64,
  stroke = 6,
  color,
  children,
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: React.ReactNode;
  label?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color ?? "var(--primary)"} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: "stroke-dashoffset 600ms ease" }} />
      </svg>
      {children && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
    </div>
  );
}

/** shadcn Empty: an icon, a title, a short hint and an action. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <Empty className={cn("border border-dashed", compact ? "p-4" : "p-10", className)}>
      <EmptyHeader>
        {icon && <EmptyMedia variant="icon">{icon}</EmptyMedia>}
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent className="flex-row flex-wrap justify-center">{action}</EmptyContent>}
    </Empty>
  );
}

export function PageHeader({ title, description, actions, className }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SubjectDot({ color, className }: { color?: string | null; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: color ?? "var(--muted-foreground)" }} />;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border bg-muted px-1 font-mono text-[10px] text-muted-foreground">{children}</kbd>;
}

/** shadcn Alert with an optional action, used for notes and warnings. */
export function Callout({ tone = "info", icon, title, children, action, className }: { tone?: Tone; icon?: React.ReactNode; title?: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <Alert className={cn("flex flex-wrap items-start gap-3 border-transparent", TONES[tone], tone === "neutral" && "bg-muted", className)}>
      {icon && <span className="mt-0.5 [&_svg]:size-4">{icon}</span>}
      <div className="min-w-0 flex-1">
        {title && <AlertTitle className="text-foreground">{title}</AlertTitle>}
        {children && <AlertDescription>{children}</AlertDescription>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </Alert>
  );
}
