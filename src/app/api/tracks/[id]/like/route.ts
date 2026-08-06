import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { setTrackLiked } from "@/lib/db";

export const runtime = "nodejs";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const { id } = await context.params;
    const body = await request.json() as { liked?: unknown };
    if (typeof body.liked !== "boolean") {
      return Response.json({ error: "A liked state is required." }, { status: 400 });
    }
    setTrackLiked(user, id, body.liked);
    return Response.json({ ok: true, liked: body.liked });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 404;
    return Response.json({ error: error instanceof Error ? error.message : "Could not update Liked Songs." }, { status });
  }
}
