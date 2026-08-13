import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { markNotificationsRead } from "@/lib/db";

export const runtime = "nodejs";

export function PATCH(request: Request): Response {
  try {
    const user = getAuthenticatedUser(request);
    return Response.json({ ok: true, updated: markNotificationsRead(user) });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Could not update notifications." }, { status });
  }
}
