import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { createPlaylist } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const body = await request.json() as {
      name?: unknown;
      description?: unknown;
      trackIds?: unknown;
      moveFromPlaylistId?: unknown;
    };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const trackIds = body.trackIds === undefined
      ? []
      : Array.isArray(body.trackIds) && body.trackIds.length <= 200
        && body.trackIds.every((trackId) => typeof trackId === "string")
        ? body.trackIds as string[]
        : null;
    const moveFromPlaylistId = body.moveFromPlaylistId === undefined
      ? undefined
      : typeof body.moveFromPlaylistId === "string" && body.moveFromPlaylistId.trim()
        ? body.moveFromPlaylistId.trim()
        : null;
    if (
      !name
      || name.length > 60
      || description.length > 160
      || trackIds === null
      || moveFromPlaylistId === null
      || (moveFromPlaylistId && !trackIds.length)
    ) {
      return Response.json({ error: "Check the playlist details and choose up to 200 songs." }, { status: 400 });
    }
    const id = createPlaylist(user, { name, description, trackIds, moveFromPlaylistId });
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    const status = error instanceof AuthenticationError
      ? 401
      : error instanceof Error && error.message.includes("not found")
        ? 404
        : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Could not create playlist." }, { status });
  }
}
