import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { getLibrary } from "@/lib/db";
import { createPlaybackTicket } from "@/lib/playback-ticket";
import type { Track } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const library = getLibrary(user);
    const tickets = new Map<string, string>();
    const decorate = (track: Track): Track => {
      if (!track.playable) return track;
      let ticket = tickets.get(track.id);
      if (!ticket) {
        ticket = createPlaybackTicket(track.id, String(user.id));
        tickets.set(track.id, ticket);
      }
      return {
        ...track,
        streamUrl: `/api/tracks/${track.id}/stream?ticket=${ticket}`,
        artworkUrl: track.hasArtwork
          ? `/api/tracks/${track.id}/artwork?ticket=${ticket}`
          : undefined,
      };
    };
    return Response.json({
      ...library,
      tracks: library.tracks.map(decorate),
      playlists: library.playlists.map((playlist) => ({
        ...playlist,
        tracks: playlist.tracks.map(decorate),
      })),
    });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 500;
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not load the library." },
      { status },
    );
  }
}
