import { createHmac, timingSafeEqual } from "node:crypto";
import type { TelegramUser } from "@/lib/types";

export type AuthenticatedTelegramUser = TelegramUser & { authDate: number };

export class AuthenticationError extends Error {}

export function validateTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 60 * 60 * 24,
  nowSeconds = Math.floor(Date.now() / 1000),
): AuthenticatedTelegramUser {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !/^[a-f\d]{64}$/i.test(hash)) {
    throw new AuthenticationError("Telegram signature is missing or malformed.");
  }

  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const expected = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest();
  const supplied = Buffer.from(hash, "hex");

  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new AuthenticationError("Telegram signature is invalid.");
  }

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || authDate > nowSeconds + 30) {
    throw new AuthenticationError("Telegram authorization date is invalid.");
  }
  if (nowSeconds - authDate > maxAgeSeconds) {
    throw new AuthenticationError("Telegram authorization has expired.");
  }

  const rawUser = params.get("user");
  if (!rawUser) throw new AuthenticationError("Telegram user is missing.");

  let user: TelegramUser;
  try {
    user = JSON.parse(rawUser) as TelegramUser;
  } catch {
    throw new AuthenticationError("Telegram user is malformed.");
  }
  if (!Number.isSafeInteger(user.id) || !user.first_name) {
    throw new AuthenticationError("Telegram user is incomplete.");
  }

  return { ...user, authDate };
}

export function getAuthenticatedUser(request: Request): AuthenticatedTelegramUser {
  const initData = request.headers.get("x-telegram-init-data") ?? "";
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (initData && botToken) return validateTelegramInitData(initData, botToken);

  const devId = Number(process.env.DEV_TELEGRAM_ID);
  if (process.env.NODE_ENV !== "production" && Number.isSafeInteger(devId)) {
    return {
      id: devId,
      first_name: "Alex",
      username: "telegram_listener",
      authDate: Math.floor(Date.now() / 1000),
    };
  }

  throw new AuthenticationError("Open this app from Telegram to sign in.");
}
