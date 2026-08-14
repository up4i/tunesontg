import { getPlaybackFile } from "@/lib/db";
import { MediaProxyError, proxyTelegramFile } from "@/lib/telegram-media";
import { PlaybackTicketError, verifyPlaybackTicket } from "@/lib/playback-ticket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    const ticketValue = new URL(request.url).searchParams.get("ticket") ?? "";
    const ticket = verifyPlaybackTicket(ticketValue, id);
    const track = getPlaybackFile(ticket.telegramId, id);
    if (!track) return Response.json({ error: "Track not found." }, { status: 404 });
    if (track.customArtwork) {
      const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/.exec(track.customArtwork);
      if (!match) return Response.json({ error: "Custom artwork is invalid." }, { status: 500 });
      return new Response(Buffer.from(match[2], "base64"), {
        headers: {
          "cache-control": "private, max-age=31536000, immutable",
          "content-type": match[1],
          "x-content-type-options": "nosniff",
        },
      });
    }
    if (!track.thumbnailFileId) {
      return Response.json({ error: "This track has no album artwork." }, { status: 404 });
    }
    return await proxyTelegramFile(request, {
      fileId: track.thumbnailFileId,
      mimeType: "image/jpeg",
      artwork: true,
    });
  } catch (error) {
    const status = error instanceof PlaybackTicketError
      ? 401
      : error instanceof MediaProxyError
        ? error.status
        : 502;
    return Response.json({
      error: error instanceof Error ? error.message : "Could not load album artwork.",
    }, { status });
  }
}
