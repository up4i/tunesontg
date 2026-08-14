import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { POST } from "../src/app/api/telegram/webhook/route";
import { getLibrary } from "../src/lib/db";

const databaseDirectory = mkdtempSync(join(tmpdir(), "tunes-webhook-"));
process.env.DATABASE_PATH = join(databaseDirectory, "test.db");
process.env.TELEGRAM_BOT_TOKEN = "test-token";
process.env.TELEGRAM_BOT_USERNAME = "test_tune_bot";
process.env.NEXT_PUBLIC_APP_URL = "https://tune.example";

const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];
const originalFetch = globalThis.fetch;

before(() => {
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = url.split("/").pop() ?? "";
    const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push({ method, payload });
    return Response.json({ ok: true, result: method === "sendMessage" ? { message_id: 9001 } : true });
  };
});

after(() => {
  globalThis.fetch = originalFetch;
  globalThis.__tunesDb?.close();
  globalThis.__tunesDb = undefined;
  rmSync(databaseDirectory, { recursive: true, force: true });
});

function webhookRequest(audio: Record<string, unknown>): Request {
  return new Request("https://tune.example/api/telegram/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      update_id: 1,
      message: {
        message_id: 42,
        from: { id: 123456, first_name: "Listener" },
        chat: { id: 123456, type: "private" },
        audio,
      },
    }),
  });
}

test("bot reports import progress and finishes with a song deep link", async () => {
  calls.length = 0;
  const response = await POST(webhookRequest({
    file_id: "telegram-file",
    file_unique_id: "telegram-unique",
    duration: 180,
    title: "Imported Song",
    performer: "Imported Artist",
    mime_type: "audio/mpeg",
    file_size: 4_000_000,
  }));
  assert.equal(response.status, 200);
  assert.equal(calls[0]?.method, "sendMessage");
  assert.match(String(calls[0]?.payload.text), /Checking the track/);
  assert.equal(calls[1]?.method, "editMessageText");
  const markup = calls[1]?.payload.reply_markup as { inline_keyboard: Array<Array<{ url: string }>> };
  assert.match(markup.inline_keyboard[0][0].url, /^https:\/\/t\.me\/test_tune_bot\?startapp=s_[a-f\d]{32}$/);
  assert.equal(getLibrary({ id: 123456, first_name: "Listener" }).importSummary.imported, 1);
});

test("bot rejects files above the hosted Bot API download limit before importing", async () => {
  calls.length = 0;
  const response = await POST(webhookRequest({
    file_id: "too-large",
    file_unique_id: "too-large-unique",
    duration: 200,
    title: "Large Song",
    performer: "Artist",
    mime_type: "audio/mpeg",
    file_size: 21 * 1024 * 1024,
  }));
  const body = await response.json() as { rejected: string };
  assert.equal(body.rejected, "file_size_limit");
  assert.equal(calls.length, 1);
  assert.match(String(calls[0]?.payload.text), /20 MB/);
  assert.equal(getLibrary({ id: 123456, first_name: "Listener" }).importSummary.failed, 1);
});
