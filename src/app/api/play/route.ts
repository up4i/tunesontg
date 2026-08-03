import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { getOwnedTracks } from "@/lib/db";
import { botChatUrl, callTelegram, TelegramApiError } from "@/lib/telegram";

export const runtime = "nodejs";

function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const body = await request.json() as { trackIds?: unknown; shuffle?: unknown };
    if (!Array.isArray(body.trackIds) || body.trackIds.some((id) => typeof id !== "string")) {
      return Response.json({ error: "Choose one or more tracks." }, { status: 400 });
    }
    const requestedIds = [...new Set(body.trackIds as string[])].slice(0, 30);
    let tracks = getOwnedTracks(user, requestedIds);
    if (tracks.length !== requestedIds.length) {
      return Response.json({ error: "One or more tracks were not found." }, { status: 404 });
    }
    if (tracks.some((track) => track.telegramFileId.startsWith("demo:"))) {
      return Response.json(
        { error: "Demo tracks are visual placeholders. Send an audio file to your bot to play it." },
        { status: 409 },
      );
    }
    if (body.shuffle === true) tracks = shuffled(tracks);

    for (let index = 0; index < tracks.length; index += 10) {
      const chunk = tracks.slice(index, index + 10);
      if (chunk.length === 1) {
        const track = chunk[0];
        await callTelegram("sendAudio", {
          chat_id: user.id,
          audio: track.telegramFileId,
          title: track.title,
          performer: track.artist,
          duration: track.duration || undefined,
          caption: index === 0 && tracks.length > 1
            ? `▶️ Queue ready · ${tracks.length} tracks`
            : undefined,
        });
      } else {
        await callTelegram("sendMediaGroup", {
          chat_id: user.id,
          media: chunk.map((track, chunkIndex) => ({
            type: "audio",
            media: track.telegramFileId,
            title: track.title,
            performer: track.artist,
            duration: track.duration || undefined,
            caption: index === 0 && chunkIndex === 0
              ? `▶️ Queue ready · ${tracks.length} tracks`
              : undefined,
          })),
        });
      }
    }

    return Response.json({ ok: true, count: tracks.length, chatUrl: botChatUrl() });
  } catch (error) {
    let status = 500;
    if (error instanceof AuthenticationError) status = 401;
    if (error instanceof TelegramApiError) status = 502;
    return Response.json({ error: error instanceof Error ? error.message : "Could not send the queue." }, { status });
  }
}
