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
    if (track.telegramFileId.startsWith("demo:")) {
      return Response.json({ error: "Demo tracks do not contain audio." }, { status: 409 });
    }
    return await proxyTelegramFile(request, {
      fileId: track.telegramFileId,
      knownSize: track.fileSize,
      mimeType: track.mimeType,
    });
  } catch (error) {
    const status = error instanceof PlaybackTicketError
      ? 401
      : error instanceof MediaProxyError
        ? error.status
        : 502;
    return Response.json({
      error: error instanceof Error ? error.message : "Could not stream this track.",
    }, { status });
  }
}
