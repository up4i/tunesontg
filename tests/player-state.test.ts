import assert from "node:assert/strict";
import test from "node:test";
import { encodePlayerState, restorePlayerState } from "../src/lib/player-state";
import type { Track } from "../src/lib/types";

function track(id: string, playable = true): Track {
  return {
    id,
    title: id,
    artist: "Tester",
    duration: 200,
    mimeType: "audio/mpeg",
    fileSize: 1000,
    addedAt: "2026-01-01T00:00:00.000Z",
    artworkSeed: 1,
    artworkRevision: "one",
    hasArtwork: false,
    hasCustomArtwork: false,
    playable,
    liked: false,
    streamUrl: playable ? `/stream/${id}` : undefined,
  };
}

test("restores queue order, playback history, repeat, shuffle, and position", () => {
  const now = Date.now();
  const raw = encodePlayerState({
    queueIds: ["two", "three"],
    currentTrackId: "two",
    playbackStackIds: ["one"],
    currentTime: 74.5,
    shuffleEnabled: true,
    repeatMode: "all",
  }, now);
  const restored = restorePlayerState(raw, [track("one"), track("two"), track("three")], now);
  assert.deepEqual(restored?.queue.map((item) => item.id), ["two", "three"]);
  assert.deepEqual(restored?.playbackStack.map((item) => item.id), ["one"]);
  assert.equal(restored?.currentTime, 74.5);
  assert.equal(restored?.repeatMode, "all");
  assert.equal(restored?.shuffleEnabled, true);
});

test("rejects expired state and removes unavailable tracks", () => {
  const now = Date.now();
  const expired = encodePlayerState({
    queueIds: ["one"], currentTrackId: "one", playbackStackIds: [], currentTime: 2,
    shuffleEnabled: false, repeatMode: "off",
  }, now - 8 * 24 * 60 * 60 * 1000);
  assert.equal(restorePlayerState(expired, [track("one")], now), null);

  const currentUnavailable = encodePlayerState({
    queueIds: ["one", "two"], currentTrackId: "one", playbackStackIds: [], currentTime: 2,
    shuffleEnabled: false, repeatMode: "one",
  }, now);
  assert.equal(restorePlayerState(currentUnavailable, [track("one", false), track("two")], now), null);
});
