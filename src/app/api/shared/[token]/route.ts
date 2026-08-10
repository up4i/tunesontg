import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import {
  getSharedPlaylistPreview,
  getSharedSongPreview,
  importSharedSong,
} from "@/lib/db";

export const runtime = "nodejs";

function validToken(token: string): boolean {
  return /^[sp]_[a-f\d]{32}$/.test(token);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const { token } = await context.params;
    if (!validToken(token)) return Response.json({ error: "This shared link is invalid." }, { status: 400 });
    const preview = token.startsWith("s_")
      ? getSharedSongPreview(user, token.slice(2))
      : getSharedPlaylistPreview(token.slice(2));
    if (!preview) return Response.json({ error: "This shared item is unavailable." }, { status: 404 });
    return Response.json(preview);
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Could not open shared item." }, { status });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const { token } = await context.params;
    if (!/^s_[a-f\d]{32}$/.test(token)) {
      return Response.json({ error: "Only shared songs can be added to your library." }, { status: 400 });
    }
    const result = importSharedSong(user, token.slice(2));
    return Response.json({
      created: result.created,
      trackId: result.track.id,
      possibleDuplicate: result.possibleDuplicate
        ? { title: result.possibleDuplicate.title, artist: result.possibleDuplicate.artist }
        : null,
    });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 404;
    return Response.json({ error: error instanceof Error ? error.message : "Could not add shared song." }, { status });
  }
}
