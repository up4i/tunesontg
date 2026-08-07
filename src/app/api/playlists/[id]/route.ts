import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { deletePlaylist, setPlaylistVisibility } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const { id } = await context.params;
    deletePlaylist(user, id);
    return Response.json({ ok: true });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 404;
    return Response.json({ error: error instanceof Error ? error.message : "Could not delete playlist." }, { status });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const { id } = await context.params;
    const body = await request.json() as { visibility?: unknown };
    if (body.visibility !== "private" && body.visibility !== "public") {
      return Response.json({ error: "Choose public or private visibility." }, { status: 400 });
    }
    setPlaylistVisibility(user, id, body.visibility);
    return Response.json({ ok: true, visibility: body.visibility });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 404;
    return Response.json({ error: error instanceof Error ? error.message : "Could not update playlist visibility." }, { status });
  }
}
