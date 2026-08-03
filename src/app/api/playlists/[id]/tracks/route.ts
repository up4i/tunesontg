import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { addTrackToPlaylist } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const { id } = await context.params;
    const body = await request.json() as { trackId?: unknown };
    if (typeof body.trackId !== "string") {
      return Response.json({ error: "A track is required." }, { status: 400 });
    }
    addTrackToPlaylist(user, id, body.trackId);
    return Response.json({ ok: true });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 404;
    return Response.json({ error: error instanceof Error ? error.message : "Could not add track." }, { status });
  }
}
