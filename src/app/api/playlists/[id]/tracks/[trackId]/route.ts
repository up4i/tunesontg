import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { removeTrackFromPlaylist } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; trackId: string }> },
): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const { id, trackId } = await context.params;
    removeTrackFromPlaylist(user, id, trackId);
    return Response.json({ ok: true });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 404;
    return Response.json({ error: error instanceof Error ? error.message : "Could not remove track." }, { status });
  }
}
