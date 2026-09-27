import "server-only";
import { prisma } from "./db";

const LOCAL_USER_ID = "local-user";
let ensured = false;

/**
 * Resolves the user for the current request.
 *
 * The app currently runs in local single-user mode with a fixed user row
 * (created on first launch). To add authentication later, replace this with a
 * session lookup — every query in the data layer is already scoped by the
 * returned user id, and API routes call this before touching data.
 */
export async function getCurrentUserId(): Promise<string> {
  if (!ensured) {
    await prisma.user.upsert({ where: { id: LOCAL_USER_ID }, update: {}, create: { id: LOCAL_USER_ID } });
    ensured = true;
  }
  return LOCAL_USER_ID;
}
