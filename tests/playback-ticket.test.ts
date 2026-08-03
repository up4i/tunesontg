import assert from "node:assert/strict";
import test from "node:test";
import {
  createPlaybackTicket,
  PlaybackTicketError,
  verifyPlaybackTicket,
} from "../src/lib/playback-ticket";

const secret = "test-only-playback-secret";

test("creates a scoped, expiring playback ticket", () => {
  const ticket = createPlaybackTicket("track-1", "424242", 300, 1_800_000_000, secret);
  const payload = verifyPlaybackTicket(ticket, "track-1", 1_800_000_100, secret);
  assert.deepEqual(payload, {
    trackId: "track-1",
    telegramId: "424242",
    expiresAt: 1_800_000_300,
  });
});

test("rejects a playback ticket used for a different track", () => {
  const ticket = createPlaybackTicket("track-1", "424242", 300, 1_800_000_000, secret);
  assert.throws(
    () => verifyPlaybackTicket(ticket, "track-2", 1_800_000_100, secret),
    PlaybackTicketError,
  );
});

test("rejects tampered and expired playback tickets", () => {
  const ticket = createPlaybackTicket("track-1", "424242", 300, 1_800_000_000, secret);
  const tampered = `${ticket.slice(0, -1)}${ticket.endsWith("a") ? "b" : "a"}`;
  assert.throws(
    () => verifyPlaybackTicket(tampered, "track-1", 1_800_000_100, secret),
    /invalid/,
  );
  assert.throws(
    () => verifyPlaybackTicket(ticket, "track-1", 1_800_000_301, secret),
    /expired/,
  );
});
