import { saveTrack, upsertUser, type IncomingTrack } from "@/lib/db";
import { appUrl, callTelegram } from "@/lib/telegram";
import type { TelegramUser } from "@/lib/types";

export const runtime = "nodejs";

type TelegramAudio = {
  file_id: string;
  file_unique_id: string;
  duration: number;
  performer?: string;
  title?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
};

type TelegramDocument = {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
};

type TelegramMessage = {
  message_id: number;
  from?: TelegramUser;
  chat: { id: number; type: string };
  text?: string;
  audio?: TelegramAudio;
  document?: TelegramDocument;
};

type TelegramUpdate = { update_id: number; message?: TelegramMessage };

function titleFromFilename(filename?: string): string {
  return filename?.replace(/\.[^.]+$/, "").trim() || "Untitled track";
}

function incomingTrack(message: TelegramMessage): IncomingTrack | null {
  if (message.audio) {
    return {
      fileId: message.audio.file_id,
      fileUniqueId: message.audio.file_unique_id,
      sourceChatId: message.chat.id,
      sourceMessageId: message.message_id,
      title: message.audio.title?.trim() || titleFromFilename(message.audio.file_name),
      artist: message.audio.performer?.trim() || "Unknown artist",
      duration: message.audio.duration || 0,
      mimeType: message.audio.mime_type,
      fileSize: message.audio.file_size,
    };
  }

  if (message.document?.mime_type?.startsWith("audio/")) {
    return {
      fileId: message.document.file_id,
      fileUniqueId: message.document.file_unique_id,
      sourceChatId: message.chat.id,
      sourceMessageId: message.message_id,
      title: titleFromFilename(message.document.file_name),
      artist: "Unknown artist",
      duration: 0,
      mimeType: message.document.mime_type,
      fileSize: message.document.file_size,
    };
  }

  return null;
}

async function sendWelcome(chatId: number, firstName: string): Promise<void> {
  await callTelegram("sendMessage", {
    chat_id: chatId,
    text: `Hey ${firstName} — this is your music inbox. 🎧\n\nSend or forward me an audio file and I’ll add it to your library. Open the app to build playlists, shuffle a queue, and send it back to Telegram’s player.`,
    reply_markup: {
      inline_keyboard: [[{ text: "Open my library", web_app: { url: appUrl() } }]],
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (process.env.NODE_ENV === "production" && !configuredSecret) {
    return Response.json({ error: "Webhook secret is not configured." }, { status: 503 });
  }
  if (configuredSecret && request.headers.get("x-telegram-bot-api-secret-token") !== configuredSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const update = await request.json() as TelegramUpdate;
    const message = update.message;
    if (!message?.from) return Response.json({ ok: true });

    if (message.chat.type !== "private") {
      await callTelegram("sendMessage", {
        chat_id: message.chat.id,
        text: "Send music to me in a private chat so your library stays private.",
        reply_to_message_id: message.message_id,
      });
      return Response.json({ ok: true });
    }

    upsertUser(message.from);
    if (message.text?.startsWith("/start") || message.text === "/help") {
      await sendWelcome(message.chat.id, message.from.first_name);
      return Response.json({ ok: true });
    }

    const trackInput = incomingTrack(message);
    if (trackInput) {
      const track = saveTrack(message.from, trackInput);
      await callTelegram("sendMessage", {
        chat_id: message.chat.id,
        text: `Saved “${track.title}” by ${track.artist} to your library.`,
        reply_to_message_id: message.message_id,
        reply_markup: {
          inline_keyboard: [[{ text: "View in library", web_app: { url: appUrl() } }]],
        },
      });
      return Response.json({ ok: true });
    }

    await callTelegram("sendMessage", {
      chat_id: message.chat.id,
      text: "Send me a Telegram audio track or an audio file, and I’ll save it to your library.",
      reply_markup: {
        inline_keyboard: [[{ text: "Open library", web_app: { url: appUrl() } }]],
      },
    });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook failed", error);
    return Response.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
