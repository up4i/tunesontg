import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { updateNotificationPreferences } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(request: Request): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const body = await request.json() as {
      collaborationActivity?: unknown;
      playlistUpdates?: unknown;
    };
    if (typeof body.collaborationActivity !== "boolean" || typeof body.playlistUpdates !== "boolean") {
      return Response.json({ error: "Choose valid notification preferences." }, { status: 400 });
    }
    updateNotificationPreferences(user, {
      collaborationActivity: body.collaborationActivity,
      playlistUpdates: body.playlistUpdates,
    });
    return Response.json({ ok: true });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Could not update preferences." }, { status });
  }
}
