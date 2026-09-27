import Link from "next/link";
import { Button as ShButton, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * App-level button API on top of shadcn's Button. `primary / secondary / ghost /
 * outline / danger / success` and `xs … lg / icon` are the names the pages use;
 * they map onto shadcn's variants and sizes.
 */
type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger" | "success";
type Size = "xs" | "sm" | "md" | "lg" | "icon" | "icon-sm";

const VARIANT = { primary: "default", secondary: "secondary", ghost: "ghost", outline: "outline", danger: "destructive", success: "default" } as const;
const SIZE = { xs: "xs", sm: "sm", md: "default", lg: "lg", icon: "icon", "icon-sm": "icon-sm" } as const;
const EXTRA: Partial<Record<Variant, string>> = { success: "bg-success text-white hover:bg-success/85 dark:text-background" };

export function buttonClasses(variant: Variant = "secondary", size: Size = "md", className?: string) {
  return cn(buttonVariants({ variant: VARIANT[variant], size: SIZE[size] }), EXTRA[variant], className);
}

export interface ButtonProps extends Omit<React.ComponentProps<typeof ShButton>, "variant" | "size"> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant = "secondary", size = "md", className, type = "button", ...props }: ButtonProps) {
  return <ShButton type={type} variant={VARIANT[variant]} size={SIZE[size]} className={cn(EXTRA[variant], className)} {...props} />;
}

export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  className,
  children,
  ...props
}: { href: string; variant?: Variant; size?: Size; className?: string; children: React.ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <ShButton asChild variant={VARIANT[variant]} size={SIZE[size]} className={cn(EXTRA[variant], className)}>
      <Link href={href} {...props}>
        {children}
      </Link>
    </ShButton>
  );
}
