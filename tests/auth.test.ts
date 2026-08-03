import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { AuthenticationError, validateTelegramInitData } from "../src/lib/auth";

const token = "123456:fake-test-token";

function signedInitData(authDate: number): string {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: "AAH-test-query",
    user: JSON.stringify({ id: 42, first_name: "Ada", username: "ada" }),
  });
  const check = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  params.set("hash", createHmac("sha256", secret).update(check).digest("hex"));
  return params.toString();
}

test("accepts signed, fresh Telegram init data", () => {
  const now = 1_800_000_000;
  const user = validateTelegramInitData(signedInitData(now - 20), token, 300, now);
  assert.equal(user.id, 42);
  assert.equal(user.first_name, "Ada");
  assert.equal(user.authDate, now - 20);
});

test("rejects tampered Telegram init data", () => {
  const now = 1_800_000_000;
  const tampered = signedInitData(now).replace("Ada", "Eve");
  assert.throws(
    () => validateTelegramInitData(tampered, token, 300, now),
    AuthenticationError,
  );
});

test("rejects expired Telegram init data", () => {
  const now = 1_800_000_000;
  assert.throws(
    () => validateTelegramInitData(signedInitData(now - 301), token, 300, now),
    /expired/,
  );
});
