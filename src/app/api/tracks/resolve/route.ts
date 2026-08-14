import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { getAccessibleTracks } from "@/lib/db";
import { createPlaybackTicket } from "@/lib/playback-ticket";

export const runtime = "nodejs";
const PLAYBACK_TICKET_TTL_SECONDS = 60 * 60 * 6;

export async function POST(request: Request): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const body = await request.json() as { trackIds?: unknown };
    if (!Array.isArray(body.trackIds) || body.trackIds.length > 250 || body.trackIds.some((id) => typeof id !== "string")) {
      return Response.json({ error: "Send up to 250 track references." }, { status: 400 });
    }
    const tracks = getAccessibleTracks(user, body.trackIds as string[]).map((track) => {
      if (!track.playable) return track;
      const ticket = createPlaybackTicket(track.id, String(user.id), PLAYBACK_TICKET_TTL_SECONDS);
      return {
        ...track,
        streamUrl: `/api/tracks/${track.id}/stream?ticket=${ticket}`,
        artworkUrl: track.hasArtwork ? `/api/tracks/${track.id}/artwork?ticket=${ticket}&v=${track.artworkRevision}` : undefined,
      };
    });
    return Response.json({ tracks });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Could not restore the queue." }, { status });
  }
}
