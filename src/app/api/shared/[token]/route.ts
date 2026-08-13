import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import {
  getSharedPlaylistPreview,
  getPublicProfile,
  getSharedSongPreview,
  importSharedPlaylist,
  importSharedSong,
} from "@/lib/db";
import { createPlaybackTicket } from "@/lib/playback-ticket";
import type { Track } from "@/lib/types";

export const runtime = "nodejs";
const PLAYBACK_TICKET_TTL_SECONDS = 60 * 60 * 6;

function validToken(token: string): boolean {
  return /^[spu]_[a-f\d]{32}$/.test(token);
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
      : token.startsWith("p_")
        ? getSharedPlaylistPreview(user, token.slice(2))
        : getPublicProfile(token.slice(2), user);
    if (!preview) return Response.json({ error: "This shared item is unavailable." }, { status: 404 });
    if (preview.type !== "playlist") return Response.json(preview);
    const decorate = (track: Track): Track => {
      if (!track.playable) return track;
      const ticket = createPlaybackTicket(track.id, String(user.id), PLAYBACK_TICKET_TTL_SECONDS);
      return {
        ...track,
        streamUrl: `/api/tracks/${track.id}/stream?ticket=${ticket}`,
        artworkUrl: track.hasArtwork
          ? `/api/tracks/${track.id}/artwork?ticket=${ticket}&v=${track.artworkRevision}`
          : undefined,
      };
    };
    return Response.json({ ...preview, tracks: preview.tracks.map(decorate) });
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
    if (!validToken(token)) {
      return Response.json({ error: "This shared link is invalid." }, { status: 400 });
    }
    if (token.startsWith("u_")) {
      return Response.json({ error: "Profiles cannot be added to your library." }, { status: 400 });
    }
    if (token.startsWith("p_")) {
      const result = importSharedPlaylist(user, token.slice(2));
      return Response.json(result);
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
