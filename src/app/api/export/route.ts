import { NextResponse } from "next/server";
import { makeBackup } from "@/lib/schemas/backup";
import { getSettings, loadAll } from "@/server/repo";
import { getCurrentUserId } from "@/server/user";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const [settings, data] = await Promise.all([getSettings(userId), loadAll(userId)]);
    const backup = makeBackup(settings, data);
    const stamp = backup.exportedAt.slice(0, 10);
    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="study-os-backup-${stamp}.json"`,
      },
    });
  } catch (err) {
    console.error("[export]", err);
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
