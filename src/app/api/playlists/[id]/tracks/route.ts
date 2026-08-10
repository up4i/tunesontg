import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { addTracksToPlaylist, removeTracksFromPlaylist } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const { id } = await context.params;
    const body = await request.json() as { trackId?: unknown; trackIds?: unknown };
    const validTrackIdList = Array.isArray(body.trackIds)
      && body.trackIds.every((trackId) => typeof trackId === "string");
    const trackIds = validTrackIdList
      ? body.trackIds as string[]
      : typeof body.trackId === "string" && body.trackIds === undefined
        ? [body.trackId]
        : [];
    if (!trackIds.length || trackIds.length > 200) {
      return Response.json({ error: "Choose between 1 and 200 tracks." }, { status: 400 });
    }
    const added = addTracksToPlaylist(user, id, trackIds);
    return Response.json({ ok: true, added });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 404;
    return Response.json({ error: error instanceof Error ? error.message : "Could not add track." }, { status });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const { id } = await context.params;
    const body = await request.json() as { trackIds?: unknown };
    if (
      !Array.isArray(body.trackIds)
      || !body.trackIds.length
      || body.trackIds.length > 200
      || body.trackIds.some((trackId) => typeof trackId !== "string")
    ) {
      return Response.json({ error: "Choose between 1 and 200 tracks." }, { status: 400 });
    }
    const removed = removeTracksFromPlaylist(user, id, body.trackIds as string[]);
    return Response.json({ ok: true, removed });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 404;
    return Response.json({ error: error instanceof Error ? error.message : "Could not remove tracks." }, { status });
  }
}
