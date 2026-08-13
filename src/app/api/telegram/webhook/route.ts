import { createTrackShare, recordImportEvent, saveTrackWithStatus, upsertUser, type IncomingTrack } from "@/lib/db";
import { formatUploadLimits, MAX_TELEGRAM_DOWNLOAD_BYTES, MAX_TRACK_DURATION_SECONDS } from "@/lib/media-limits";
import { appUrl, callTelegram, miniAppDeepLink } from "@/lib/telegram";
import type { TelegramUser } from "@/lib/types";

export const runtime = "nodejs";

type TelegramPhotoSize = {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
};

type TelegramAudio = {
  file_id: string;
  file_unique_id: string;
  duration: number;
  performer?: string;
  title?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
  thumbnail?: TelegramPhotoSize;
};

type TelegramDocument = {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
  thumbnail?: TelegramPhotoSize;
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

function isAudioDocument(document?: TelegramDocument): document is TelegramDocument {
  return Boolean(
    document
    && (
      document.mime_type?.startsWith("audio/")
      || /\.(mp3|m4a|aac|flac|wav|ogg|opus)$/i.test(document.file_name ?? "")
    ),
  );
}

function audioMimeType(document: TelegramDocument): string | undefined {
  if (document.mime_type?.startsWith("audio/")) return document.mime_type;
  const extension = document.file_name?.split(".").pop()?.toLowerCase();
  return ({
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    flac: "audio/flac",
    wav: "audio/wav",
    ogg: "audio/ogg",
    opus: "audio/ogg",
  } as Record<string, string>)[extension ?? ""];
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
      thumbnailFileId: message.audio.thumbnail?.file_id,
      thumbnailUniqueId: message.audio.thumbnail?.file_unique_id,
    };
  }

  if (isAudioDocument(message.document)) {
    return {
      fileId: message.document.file_id,
      fileUniqueId: message.document.file_unique_id,
      sourceChatId: message.chat.id,
      sourceMessageId: message.message_id,
      title: titleFromFilename(message.document.file_name),
      artist: "Unknown artist",
      duration: 0,
      mimeType: audioMimeType(message.document),
      fileSize: message.document.file_size,
      thumbnailFileId: message.document.thumbnail?.file_id,
      thumbnailUniqueId: message.document.thumbnail?.file_unique_id,
    };
  }

  return null;
}

async function sendWelcome(chatId: number, firstName: string): Promise<void> {
  await callTelegram("sendMessage", {
    chat_id: chatId,
    text: `Hey ${firstName} — this is your music inbox. 🎧\n\nSend or forward me a Music/Audio track up to ${formatUploadLimits()} and I’ll add it to your library. Open the app to build playlists and play your music without leaving Telegram.`,
    reply_markup: {
      inline_keyboard: [[{ text: "Open my library", web_app: { url: appUrl() } }]],
    },
  });
}

async function finishImportMessage(chatId: number, messageId: number, text: string, url?: string): Promise<void> {
  const action = url ? { reply_markup: { inline_keyboard: [[{ text: "View song", url }]] } } : {};
  try {
    await callTelegram("editMessageText", { chat_id: chatId, message_id: messageId, text, ...action });
  } catch {
    await callTelegram("sendMessage", { chat_id: chatId, text, ...action });
  }
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

    if (!message.audio && isAudioDocument(message.document)) {
      recordImportEvent(message.from, "failed", "duration_unknown");
      await callTelegram("sendMessage", {
        chat_id: message.chat.id,
        text: "Please send this using Telegram’s Music/Audio option instead of as a document. That lets me verify the 10-minute limit before adding it.",
        reply_to_message_id: message.message_id,
      });
      return Response.json({ ok: true, rejected: "duration_unknown" });
    }

    const trackInput = incomingTrack(message);
    if (trackInput) {
      if (trackInput.duration > MAX_TRACK_DURATION_SECONDS) {
        recordImportEvent(message.from, "failed", "duration_limit");
        await callTelegram("sendMessage", {
          chat_id: message.chat.id,
          text: "This song is longer than 10 minutes, so I couldn’t add it. Please send a shorter track.",
          reply_to_message_id: message.message_id,
        });
        return Response.json({ ok: true, rejected: "duration_limit" });
      }
      if (trackInput.fileSize && trackInput.fileSize > MAX_TELEGRAM_DOWNLOAD_BYTES) {
        recordImportEvent(message.from, "failed", "file_size_limit");
        await callTelegram("sendMessage", {
          chat_id: message.chat.id,
          text: "This song is over Telegram’s 20 MB streaming limit, so I couldn’t add it. Please send a smaller audio file.",
          reply_to_message_id: message.message_id,
        });
        return Response.json({ ok: true, rejected: "file_size_limit" });
      }

      const progress = await callTelegram<{ message_id: number }>("sendMessage", {
        chat_id: message.chat.id,
        text: "Checking the track, metadata, and duplicates…",
        reply_to_message_id: message.message_id,
      });
      try {
        const { track, created, possibleDuplicate } = saveTrackWithStatus(message.from, trackInput);
        recordImportEvent(message.from, created ? "imported" : "duplicate");
        const shareId = createTrackShare(message.from, track.id);
        const resultText = created
          ? possibleDuplicate
            ? `Saved “${track.title}” by ${track.artist}. It may duplicate “${possibleDuplicate.title}” by ${possibleDuplicate.artist}; open the song to review its details.`
            : `Saved “${track.title}” by ${track.artist} to your library.`
          : `“${track.title}” by ${track.artist} is already in your library. I didn’t add a duplicate.`;
        await finishImportMessage(message.chat.id, progress.message_id, resultText, miniAppDeepLink(`s_${shareId}`));
      } catch (importError) {
        console.error("Track import failed", importError);
        recordImportEvent(message.from, "failed", "import_failed");
        await finishImportMessage(
          message.chat.id,
          progress.message_id,
          "I couldn’t add this track. Verify that it is Music/Audio within 10 minutes and 20 MB, then try again.",
        );
        return Response.json({ ok: true, rejected: "import_failed" });
      }
      return Response.json({ ok: true });
    }

    await callTelegram("sendMessage", {
      chat_id: message.chat.id,
      text: `Send me a Telegram Music/Audio track up to ${formatUploadLimits()}, and I’ll save it to your library.`,
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
