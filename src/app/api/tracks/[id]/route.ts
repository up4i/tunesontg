import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { updateTrackDetails } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const { id } = await context.params;
    const body = await request.json() as { title?: unknown; artist?: unknown; customArtwork?: unknown };
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const artist = typeof body.artist === "string" ? body.artist.trim() : "";
    const artworkIsValid = body.customArtwork === "keep"
      || body.customArtwork === undefined
      || body.customArtwork === null
      || (typeof body.customArtwork === "string" && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(body.customArtwork));
    const customArtwork = body.customArtwork === "keep" || body.customArtwork === undefined
      ? undefined
      : body.customArtwork === null
      ? null
      : typeof body.customArtwork === "string" && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(body.customArtwork)
        ? body.customArtwork
        : undefined;
    const encodedArtworkBytes = customArtwork
      ? Math.ceil((customArtwork.length - customArtwork.indexOf(",") - 1) * 0.75)
      : 0;
    if (
      !title || title.length > 100
      || !artist || artist.length > 100
      || !artworkIsValid
      || encodedArtworkBytes > 750_000
    ) {
      return Response.json({ error: "Enter a valid title, artist, and artwork under 750 KB." }, { status: 400 });
    }
    updateTrackDetails(user, id, { title, artist, customArtwork });
    return Response.json({ ok: true, title, artist });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 404;
    return Response.json({ error: error instanceof Error ? error.message : "Could not update track." }, { status });
  }
}
