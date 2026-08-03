import { callTelegram, telegramFileUrl } from "@/lib/telegram";

const MAX_BOT_DOWNLOAD_BYTES = 20 * 1024 * 1024;

type TelegramFile = {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
};

export class MediaProxyError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

export async function proxyTelegramFile(
  request: Request,
  input: {
    fileId: string;
    knownSize?: number | null;
    mimeType?: string | null;
    artwork?: boolean;
  },
): Promise<Response> {
  if (input.knownSize && input.knownSize > MAX_BOT_DOWNLOAD_BYTES) {
    throw new MediaProxyError(
      "This file is over Telegram's 20 MB Bot API streaming limit.",
      413,
    );
  }

  const telegramFile = await callTelegram<TelegramFile>("getFile", {
    file_id: input.fileId,
  });
  if (!telegramFile.file_path) {
    throw new MediaProxyError("Telegram did not return a downloadable file path.");
  }
  if (telegramFile.file_size && telegramFile.file_size > MAX_BOT_DOWNLOAD_BYTES) {
    throw new MediaProxyError(
      "This file is over Telegram's 20 MB Bot API streaming limit.",
      413,
    );
  }

  const upstreamHeaders = new Headers();
  const range = request.headers.get("range");
  if (range && /^bytes=\d*-\d*$/.test(range)) upstreamHeaders.set("range", range);

  const upstream = await fetch(telegramFileUrl(telegramFile.file_path), {
    headers: upstreamHeaders,
    signal: request.signal,
    cache: "no-store",
  });
  if (!upstream.ok && upstream.status !== 206) {
    throw new MediaProxyError(`Telegram media request failed with ${upstream.status}.`);
  }
  if (!upstream.body) throw new MediaProxyError("Telegram returned an empty media response.");

  const headers = new Headers({
    "cache-control": input.artwork ? "private, max-age=3600" : "private, max-age=300",
    "content-type": upstream.headers.get("content-type")
      ?? input.mimeType
      ?? (input.artwork ? "image/jpeg" : "audio/mpeg"),
    "x-content-type-options": "nosniff",
  });
  for (const name of ["accept-ranges", "content-length", "content-range", "etag", "last-modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  return new Response(upstream.body, { status: upstream.status, headers });
}
