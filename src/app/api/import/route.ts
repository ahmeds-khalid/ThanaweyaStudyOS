import { NextResponse } from "next/server";
import { z } from "zod";
import { validateBackup } from "@/lib/schemas/backup";
import { importBackup } from "@/server/repo";
import { getCurrentUserId } from "@/server/user";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  mode: z.enum(["merge", "replace"]),
  /** The client must explicitly confirm a destructive replace. */
  confirmReplace: z.boolean().optional(),
  includeSettings: z.boolean().optional(),
  backup: z.unknown(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { mode, confirmReplace, includeSettings, backup } = parsed.data;
  if (mode === "replace" && !confirmReplace) {
    return NextResponse.json({ error: "Replacing data requires confirmation" }, { status: 400 });
  }

  const validation = validateBackup(backup);
  if (!validation.ok || !validation.backup) {
    return NextResponse.json({ error: "Backup failed validation", details: validation.errors }, { status: 422 });
  }

  try {
    const userId = await getCurrentUserId();
    const result = await importBackup(
      userId,
      validation.backup.data,
      includeSettings ? validation.backup.settings : null,
      mode,
    );
    return NextResponse.json({ ok: true, ...result, counts: validation.counts });
  } catch (err) {
    console.error("[import]", err);
    return NextResponse.json({ error: "Import failed — no changes were saved." }, { status: 500 });
  }
}
