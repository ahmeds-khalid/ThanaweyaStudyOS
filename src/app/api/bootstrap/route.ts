import { NextResponse } from "next/server";
import { getSettings, loadAll } from "@/server/repo";
import { getCurrentUserId } from "@/server/user";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const [settings, data] = await Promise.all([getSettings(userId), loadAll(userId)]);
    return NextResponse.json({ settings, data, serverTime: new Date().toISOString() });
  } catch (err) {
    console.error("[bootstrap]", err);
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
