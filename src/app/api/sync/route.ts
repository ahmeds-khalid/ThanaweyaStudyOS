import { NextResponse } from "next/server";
import { z } from "zod";
import { applyOp, syncOpSchema, type SyncResult } from "@/server/repo";
import { getCurrentUserId } from "@/server/user";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ ops: z.array(z.unknown()).max(200) });

/**
 * Applies a batch of queued client mutations in order. Each op succeeds or
 * fails independently so one invalid change never blocks the rest.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (err) {
    console.error("[sync] database unavailable", err);
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const results: SyncResult[] = [];
  for (const raw of parsed.data.ops) {
    const op = syncOpSchema.safeParse(raw);
    if (!op.success) {
      const opId = (raw as { opId?: unknown })?.opId;
      results.push({ opId: typeof opId === "string" ? opId : "unknown", ok: false, error: "Malformed operation" });
      continue;
    }
    results.push(await applyOp(userId, op.data));
  }
  return NextResponse.json({ results });
}
