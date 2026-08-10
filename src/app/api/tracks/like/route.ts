import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { setTracksLiked } from "@/lib/db";

export const runtime = "nodejs";

export async function PUT(request: Request): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const body = await request.json() as { trackIds?: unknown; liked?: unknown };
    if (
      !Array.isArray(body.trackIds)
      || !body.trackIds.length
      || body.trackIds.length > 200
      || body.trackIds.some((trackId) => typeof trackId !== "string")
      || typeof body.liked !== "boolean"
    ) {
      return Response.json({ error: "Choose tracks and a liked state." }, { status: 400 });
    }
    const changed = setTracksLiked(user, body.trackIds as string[], body.liked);
    return Response.json({ ok: true, changed, liked: body.liked });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 404;
    return Response.json({
      error: error instanceof Error ? error.message : "Could not update Liked Songs.",
    }, { status });
  }
}
