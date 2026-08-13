import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { deleteTracks } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(request: Request): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const body = await request.json() as { trackIds?: unknown };
    if (
      !Array.isArray(body.trackIds)
      || !body.trackIds.length
      || body.trackIds.length > 200
      || body.trackIds.some((trackId) => typeof trackId !== "string")
    ) {
      return Response.json({ error: "Choose between 1 and 200 tracks." }, { status: 400 });
    }
    const deleted = deleteTracks(user, body.trackIds as string[]);
    return Response.json({ ok: true, deleted });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 404;
    return Response.json({
      error: error instanceof Error ? error.message : "Could not remove tracks from your library.",
    }, { status });
  }
}
