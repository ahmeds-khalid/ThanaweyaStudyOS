import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm text-muted-foreground">404</p>
      <h1 className="text-xl font-semibold">This page doesn&apos;t exist.</h1>
      <Link href="/" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
        Back to dashboard
      </Link>
    </div>
  );
}
