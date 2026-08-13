import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { getLibrary } from "@/lib/db";
import { createPlaybackTicket } from "@/lib/playback-ticket";
import type { Track } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const PLAYBACK_TICKET_TTL_SECONDS = 60 * 60 * 6;
const PLAYBACK_TICKET_WINDOW_SECONDS = 60 * 30;

export async function GET(request: Request): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const library = getLibrary(user);
    const tickets = new Map<string, string>();
    const ticketIssuedAt = Math.floor(
      Date.now() / 1000 / PLAYBACK_TICKET_WINDOW_SECONDS,
    ) * PLAYBACK_TICKET_WINDOW_SECONDS;
    const decorate = (track: Track): Track => {
      if (!track.playable) return track;
      let ticket = tickets.get(track.id);
      if (!ticket) {
        ticket = createPlaybackTicket(
          track.id,
          String(user.id),
          PLAYBACK_TICKET_TTL_SECONDS,
          ticketIssuedAt,
        );
        tickets.set(track.id, ticket);
      }
      return {
        ...track,
        streamUrl: `/api/tracks/${track.id}/stream?ticket=${ticket}`,
        artworkUrl: track.hasArtwork
          ? `/api/tracks/${track.id}/artwork?ticket=${ticket}&v=${track.artworkRevision}`
          : undefined,
      };
    };
    return Response.json({
      ...library,
      tracks: library.tracks.map(decorate),
      availableTracks: library.availableTracks.map(decorate),
      recentlyPlayed: library.recentlyPlayed.map(decorate),
      recommendations: library.recommendations.map(decorate),
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
