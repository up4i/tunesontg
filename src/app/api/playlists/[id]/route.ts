import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { deletePlaylist, setPlaylistVisibility, updatePlaylistDetails } from "@/lib/db";

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
    const body = await request.json() as {
      visibility?: unknown;
      name?: unknown;
      description?: unknown;
      coverSeed?: unknown;
    };
    if (body.visibility === "private" || body.visibility === "public") {
      setPlaylistVisibility(user, id, body.visibility);
      return Response.json({ ok: true, visibility: body.visibility });
    }
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const coverSeed = body.coverSeed === null
      ? null
      : Number.isInteger(body.coverSeed) && Number(body.coverSeed) >= 0 && Number(body.coverSeed) <= 7
        ? Number(body.coverSeed)
        : undefined;
    if (!name || name.length > 60 || description.length > 160 || coverSeed === undefined) {
      return Response.json({ error: "Enter valid playlist details and choose a cover." }, { status: 400 });
    }
    updatePlaylistDetails(user, id, { name, description, coverSeed });
    return Response.json({ ok: true, name, description, coverSeed });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 404;
    return Response.json({ error: error instanceof Error ? error.message : "Could not update playlist visibility." }, { status });
  }
}
