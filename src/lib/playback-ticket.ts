import { createHmac, timingSafeEqual } from "node:crypto";

export type PlaybackTicket = {
  trackId: string;
  telegramId: string;
  expiresAt: number;
};

export class PlaybackTicketError extends Error {}

function ticketSecret(override?: string): string {
  const secret = override
    ?? process.env.PLAYBACK_SIGNING_SECRET
    ?? process.env.TELEGRAM_BOT_TOKEN;
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") return "tunes-development-ticket-secret";
  throw new PlaybackTicketError("Playback signing is not configured.");
}

function signature(payload: string, secret?: string): string {
  return createHmac("sha256", ticketSecret(secret))
    .update(`tunes-playback-v1:${payload}`)
    .digest("base64url");
}

export function createPlaybackTicket(
  trackId: string,
  telegramId: string,
  ttlSeconds = 60 * 60 * 6,
  nowSeconds = Math.floor(Date.now() / 1000),
  secret?: string,
): string {
  const payload = Buffer.from(JSON.stringify({
    trackId,
    telegramId,
    expiresAt: nowSeconds + ttlSeconds,
  } satisfies PlaybackTicket)).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyPlaybackTicket(
  ticket: string,
  expectedTrackId: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  secret?: string,
): PlaybackTicket {
  const [payload, suppliedSignature, extra] = ticket.split(".");
  if (!payload || !suppliedSignature || extra) {
    throw new PlaybackTicketError("Playback ticket is malformed.");
  }
  const expectedSignature = signature(payload, secret);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new PlaybackTicketError("Playback ticket is invalid.");
  }

  let parsed: PlaybackTicket;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as PlaybackTicket;
  } catch {
    throw new PlaybackTicketError("Playback ticket payload is invalid.");
  }
  if (
    parsed.trackId !== expectedTrackId
    || typeof parsed.telegramId !== "string"
    || !Number.isSafeInteger(parsed.expiresAt)
  ) {
    throw new PlaybackTicketError("Playback ticket does not match this track.");
  }
  if (parsed.expiresAt < nowSeconds) {
    throw new PlaybackTicketError("Playback ticket has expired. Refresh your library.");
  }
  return parsed;
}
