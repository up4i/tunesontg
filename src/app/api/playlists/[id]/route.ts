import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { deletePlaylist, setPlaylistCollaborative, setPlaylistFolder, setPlaylistVisibility, updatePlaylistDetails } from "@/lib/db";

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
      coverImage?: unknown;
      collaborative?: unknown;
      folderId?: unknown;
    };
    if (body.visibility === "private" || body.visibility === "public") {
      setPlaylistVisibility(user, id, body.visibility);
      return Response.json({ ok: true, visibility: body.visibility });
    }
    if (typeof body.collaborative === "boolean") {
      setPlaylistCollaborative(user, id, body.collaborative);
      return Response.json({ ok: true, collaborative: body.collaborative });
    }
    if (body.folderId === null || typeof body.folderId === "string") {
      const folderId = typeof body.folderId === "string" && body.folderId.trim() ? body.folderId.trim() : null;
      setPlaylistFolder(user, id, folderId);
      return Response.json({ ok: true, folderId });
    }
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const coverSeed = body.coverSeed === null
      ? null
      : Number.isInteger(body.coverSeed) && Number(body.coverSeed) >= 0 && Number(body.coverSeed) <= 7
        ? Number(body.coverSeed)
        : undefined;
    const coverImage = body.coverImage === null
      ? null
      : typeof body.coverImage === "string" && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(body.coverImage)
        ? body.coverImage
        : undefined;
    const encodedImageBytes = coverImage ? Math.ceil((coverImage.length - coverImage.indexOf(",") - 1) * 0.75) : 0;
    if (!name || name.length > 60 || description.length > 160 || coverSeed === undefined || coverImage === undefined || encodedImageBytes > 750_000) {
      return Response.json({ error: "Enter valid playlist details and choose a cover." }, { status: 400 });
    }
    updatePlaylistDetails(user, id, { name, description, coverSeed, coverImage });
    return Response.json({ ok: true, name, description, coverSeed, coverImage });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 404;
    return Response.json({ error: error instanceof Error ? error.message : "Could not update playlist visibility." }, { status });
  }
}
