import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { POST as sendQueue } from "../src/app/api/play/route";
import {
  addTracksToPlaylist,
  createBugReport,
  createPlaylistShare,
  createPlaylist,
  createTrackShare,
  deleteTracks,
  deletePlaylist,
  getLibrary,
  getPlaybackFile,
  getSharedPlaylistPreview,
  getSharedSongPreview,
  importSharedPlaylist,
  importSharedSong,
  recordPlaybackEvents,
  recordTrackPlayed,
  removeTracksFromPlaylist,
  saveTrack,
  saveTrackWithStatus,
  setTracksLiked,
  setTrackLiked,
  setPlaylistVisibility,
  updatePlaylistDetails,
  updateTrackDetails,
  upsertUser,
} from "../src/lib/db";
import type { TelegramUser } from "../src/lib/types";

const databaseDirectory = mkdtempSync(join(tmpdir(), "tunes-playlists-"));
process.env.DATABASE_PATH = join(databaseDirectory, "test.db");

after(() => {
  globalThis.__tunesDb?.close();
  globalThis.__tunesDb = undefined;
  rmSync(databaseDirectory, { recursive: true, force: true });
});

const user: TelegramUser = { id: 12345, first_name: "Playlist Tester" };

test("bulk playlist additions are ordered and idempotent", () => {
  const first = saveTrack(user, {
    fileId: "file-one",
    fileUniqueId: "unique-one",
    sourceChatId: 12345,
    sourceMessageId: 1,
    title: "First",
    artist: "Tester",
    duration: 120,
  });
  const second = saveTrack(user, {
    fileId: "file-two",
    fileUniqueId: "unique-two",
    sourceChatId: 12345,
    sourceMessageId: 2,
    title: "Second",
    artist: "Tester",
    duration: 180,
  });
  const playlistId = createPlaylist(user, { name: "Test playlist" });

  assert.equal(addTracksToPlaylist(user, playlistId, [first.id, second.id]), 2);
  assert.equal(addTracksToPlaylist(user, playlistId, [first.id, first.id]), 0);

  const playlist = getLibrary(user).playlists.find((item) => item.id === playlistId);
  assert.equal(playlist?.trackCount, 2);
  assert.equal(playlist?.duration, 300);
  assert.deepEqual(playlist?.tracks.map((track) => track.id), [first.id, second.id]);
});

test("deleting a playlist retains its songs in the library", () => {
  const library = getLibrary(user);
  const playlist = library.playlists.find((item) => item.kind === "standard");
  assert.ok(playlist);

  deletePlaylist(user, playlist.id);

  const updated = getLibrary(user);
  assert.equal(updated.playlists.some((item) => item.id === playlist.id), false);
  assert.equal(updated.playlists.filter((item) => item.kind === "liked").length, 1);
  assert.equal(updated.tracks.length, 2);
  assert.throws(() => deletePlaylist(user, playlist.id), /not found/);
});

test("Liked Songs is created once and liking is idempotent", () => {
  const track = getLibrary(user).tracks[0];
  assert.ok(track);

  setTrackLiked(user, track.id, true);
  setTrackLiked(user, track.id, true);

  let library = getLibrary(user);
  const liked = library.playlists.find((item) => item.kind === "liked");
  assert.equal(liked?.trackCount, 1);
  assert.equal(library.tracks.find((item) => item.id === track.id)?.liked, true);

  setTrackLiked(user, track.id, false);
  library = getLibrary(user);
  assert.equal(library.playlists.find((item) => item.kind === "liked")?.trackCount, 0);
  assert.equal(library.tracks.find((item) => item.id === track.id)?.liked, false);
  assert.throws(() => deletePlaylist(user, liked!.id), /not found/);
});

test("duplicate Telegram files report that no second song was created", () => {
  const result = saveTrackWithStatus(user, {
    fileId: "file-one-refreshed",
    fileUniqueId: "unique-one",
    sourceChatId: 12345,
    sourceMessageId: 3,
    title: "First",
    artist: "Tester",
    duration: 120,
  });

  assert.equal(result.created, false);
  assert.equal(getLibrary(user).tracks.length, 2);
});

test("a Telegram profile photo survives bot updates that omit it", () => {
  upsertUser({ ...user, photo_url: "https://example.com/avatar.jpg" });
  upsertUser(user);
  assert.equal(getLibrary(user).user.photoUrl, "https://example.com/avatar.jpg");
});

test("listening history records owned songs without duplicating history rows", () => {
  const track = getLibrary(user).tracks[0];
  assert.ok(track);

  recordTrackPlayed(user, track.id);
  recordTrackPlayed(user, track.id);

  const history = getLibrary(user).recentlyPlayed;
  assert.equal(history.filter((item) => item.id === track.id).length, 1);
  assert.throws(() => recordTrackPlayed(user, "missing-track"), /not found/);
});

test("shared songs can be previewed and added without duplicate copies", () => {
  const track = getLibrary(user).tracks[0];
  assert.ok(track);
  const shareId = createTrackShare(user, track.id);
  const recipient: TelegramUser = { id: 67890, first_name: "Recipient" };

  assert.equal(getSharedSongPreview(recipient, shareId)?.alreadyAdded, false);
  assert.equal(importSharedSong(recipient, shareId).created, true);
  assert.equal(importSharedSong(recipient, shareId).created, false);
  assert.equal(getSharedSongPreview(recipient, shareId)?.alreadyAdded, true);
  assert.equal(getLibrary(recipient).tracks.length, 1);
});

test("only public playlists can be opened from a share link", () => {
  const track = getLibrary(user).tracks[0];
  assert.ok(track);
  const playlistId = createPlaylist(user, { name: "Shared playlist", description: "For testing" });
  addTracksToPlaylist(user, playlistId, [track.id]);

  assert.throws(() => createPlaylistShare(user, playlistId), /public/);
  setPlaylistVisibility(user, playlistId, "public");
  const shareId = createPlaylistShare(user, playlistId);
  const preview = getSharedPlaylistPreview(user, shareId);
  assert.equal(preview?.name, "Shared playlist");
  assert.equal(preview?.trackCount, 1);

  const recipient: TelegramUser = { id: 24680, first_name: "Playlist Recipient" };
  const imported = importSharedPlaylist(recipient, shareId);
  assert.equal(imported.created, true);
  assert.equal(imported.addedTracks, 1);
  assert.equal(importSharedPlaylist(recipient, shareId).created, false);
  assert.equal(getSharedPlaylistPreview(recipient, shareId)?.alreadyAdded, true);
  assert.equal(getLibrary(recipient).playlists.find((playlist) => playlist.id === imported.playlistId)?.trackCount, 1);

  setPlaylistVisibility(user, playlistId, "private");
  assert.equal(getSharedPlaylistPreview(user, shareId), null);
});

test("track metadata and custom artwork can be edited", () => {
  const track = saveTrack(user, {
    fileId: "editable-file",
    fileUniqueId: "editable-unique",
    sourceChatId: user.id,
    sourceMessageId: 889,
    title: "Before",
    artist: "Unknown artist",
    duration: 190,
  });
  const artwork = "data:image/webp;base64,UklGRg==";
  updateTrackDetails(user, track.id, { title: "After", artist: "Known Artist", customArtwork: artwork });
  const updated = getLibrary(user).tracks.find((item) => item.id === track.id);
  assert.equal(updated?.title, "After");
  assert.equal(updated?.artist, "Known Artist");
  assert.equal(updated?.hasCustomArtwork, true);
  assert.equal(getPlaybackFile(String(user.id), track.id)?.customArtwork, artwork);
});

test("playback events produce a seven-day health summary", () => {
  const track = getLibrary(user).tracks[0];
  assert.ok(track);
  recordPlaybackEvents(user, [
    { trackId: track.id, sessionId: "session_1234", event: "play_request" },
    { trackId: track.id, sessionId: "session_1234", event: "playback_started", startupMs: 420 },
    { trackId: track.id, sessionId: "session_1234", event: "buffer_start", positionSeconds: 18 },
    { trackId: track.id, sessionId: "session_1234", event: "stream_error", positionSeconds: 18 },
    { trackId: track.id, sessionId: "session_1234", event: "retry_recovered", startupMs: 300 },
  ]);
  const summary = getLibrary(user).playbackSummary;
  assert.equal(summary.starts, 1);
  assert.equal(summary.averageStartupMs, 420);
  assert.equal(summary.stalls, 1);
  assert.equal(summary.errors, 1);
  assert.equal(summary.recoveredRetries, 1);
});

test("a playlist can be created with selected songs and move them atomically", () => {
  const first = saveTrack(user, {
    fileId: "atomic-one",
    fileUniqueId: "atomic-unique-one",
    sourceChatId: 12345,
    sourceMessageId: 101,
    title: "Atomic First",
    artist: "Tester",
    duration: 121,
  });
  const second = saveTrack(user, {
    fileId: "atomic-two",
    fileUniqueId: "atomic-unique-two",
    sourceChatId: 12345,
    sourceMessageId: 102,
    title: "Atomic Second",
    artist: "Tester",
    duration: 182,
  });
  const sourceId = createPlaylist(user, { name: "Move source" });
  addTracksToPlaylist(user, sourceId, [first.id, second.id]);

  const targetId = createPlaylist(user, {
    name: "Created from selection",
    trackIds: [first.id, second.id],
    moveFromPlaylistId: sourceId,
  });
  const library = getLibrary(user);
  assert.deepEqual(
    library.playlists.find((playlist) => playlist.id === targetId)?.tracks.map((track) => track.id),
    [first.id, second.id],
  );
  assert.equal(library.playlists.find((playlist) => playlist.id === sourceId)?.trackCount, 0);

  assert.throws(() => createPlaylist(user, {
    name: "Must roll back",
    trackIds: ["missing-track"],
  }), /not found/i);
  assert.equal(getLibrary(user).playlists.some((playlist) => playlist.name === "Must roll back"), false);

  assert.throws(() => createPlaylist(user, {
    name: "Must not fake a move",
    trackIds: [first.id],
    moveFromPlaylistId: sourceId,
  }), /source playlist/i);
  assert.equal(getLibrary(user).playlists.some((playlist) => playlist.name === "Must not fake a move"), false);
});

test("Telegram queue API rejects empty and oversized requests", async () => {
  process.env.DEV_TELEGRAM_ID = String(user.id);
  try {
    const emptyResponse = await sendQueue(new Request("http://localhost/api/play", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trackIds: [] }),
    }));
    assert.equal(emptyResponse.status, 400);

    const oversizedResponse = await sendQueue(new Request("http://localhost/api/play", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trackIds: Array.from({ length: 31 }, (_, index) => `track-${index}`) }),
    }));
    assert.equal(oversizedResponse.status, 400);
  } finally {
    delete process.env.DEV_TELEGRAM_ID;
  }
});

test("playlist details and generated cover can be edited", () => {
  const playlistId = createPlaylist(user, { name: "Before", description: "Old description" });

  updatePlaylistDetails(user, playlistId, {
    name: "After",
    description: "Fresh description",
    coverSeed: 5,
    coverImage: "data:image/webp;base64,UklGRg==",
  });

  const playlist = getLibrary(user).playlists.find((item) => item.id === playlistId);
  assert.equal(playlist?.name, "After");
  assert.equal(playlist?.description, "Fresh description");
  assert.equal(playlist?.coverSeed, 5);
  assert.equal(playlist?.coverImage, "data:image/webp;base64,UklGRg==");
});

test("songs longer than ten minutes are rejected", () => {
  assert.throws(() => saveTrack(user, {
    fileId: "too-long",
    fileUniqueId: "too-long-unique",
    sourceChatId: 12345,
    sourceMessageId: 4,
    title: "Extended mix",
    artist: "Tester",
    duration: 601,
  }), /up to 10 minutes/);
  assert.equal(getLibrary(user).tracks.some((track) => track.title === "Extended mix"), false);
});

test("bulk likes and playlist removals are transactional", () => {
  const first = saveTrack(user, {
    fileId: "bulk-one",
    fileUniqueId: "bulk-unique-one",
    sourceChatId: 12345,
    sourceMessageId: 31,
    title: "Bulk First",
    artist: "Tester",
    duration: 121,
  });
  const second = saveTrack(user, {
    fileId: "bulk-two",
    fileUniqueId: "bulk-unique-two",
    sourceChatId: 12345,
    sourceMessageId: 32,
    title: "Bulk Second",
    artist: "Tester",
    duration: 181,
  });
  const playlistId = createPlaylist(user, { name: "Bulk playlist" });
  addTracksToPlaylist(user, playlistId, [first.id, second.id]);

  assert.equal(setTracksLiked(user, [first.id, second.id], true), 2);
  assert.equal((getLibrary(user).playlists.find((item) => item.kind === "liked")?.trackCount ?? 0) >= 2, true);
  assert.equal(removeTracksFromPlaylist(user, playlistId, [first.id, second.id]), 2);
  assert.equal(getLibrary(user).playlists.find((item) => item.id === playlistId)?.trackCount, 0);
});

test("removing songs from the library cascades to playlists and history", () => {
  const track = saveTrack(user, {
    fileId: "delete-me",
    fileUniqueId: "delete-me-unique",
    sourceChatId: 12345,
    sourceMessageId: 41,
    title: "Delete Me",
    artist: "Tester",
    duration: 90,
  });
  const playlistId = createPlaylist(user, { name: "Deletion cascade" });
  addTracksToPlaylist(user, playlistId, [track.id]);
  recordTrackPlayed(user, track.id);

  assert.equal(deleteTracks(user, [track.id]), 1);
  const library = getLibrary(user);
  assert.equal(library.tracks.some((item) => item.id === track.id), false);
  assert.equal(library.recentlyPlayed.some((item) => item.id === track.id), false);
  assert.equal(library.playlists.find((item) => item.id === playlistId)?.trackCount, 0);
  assert.throws(() => deleteTracks(user, [track.id]), /not found/);
});

test("similar metadata warns about a possible duplicate without blocking the import", () => {
  saveTrack(user, {
    fileId: "similar-one",
    fileUniqueId: "similar-unique-one",
    sourceChatId: 12345,
    sourceMessageId: 51,
    title: "Soft Focus",
    artist: "June & The Satellites",
    duration: 216,
  });
  const result = saveTrackWithStatus(user, {
    fileId: "similar-two",
    fileUniqueId: "similar-unique-two",
    sourceChatId: 12345,
    sourceMessageId: 52,
    title: "Soft Focus!",
    artist: "June & The Satellites!",
    duration: 218,
  });

  assert.equal(result.created, true);
  assert.equal(result.possibleDuplicate?.title, "Soft Focus");
});

test("bug reports store only the supplied sanitized context", () => {
  const id = createBugReport(user, {
    description: "The volume panel overlaps the secure streaming label.",
    context: { platform: "tdesktop", telegramVersion: "9.0" },
  });
  const row = globalThis.__tunesDb?.prepare("SELECT * FROM bug_reports WHERE id = ?").get(id) as {
    description: string;
    context_json: string;
  } | undefined;
  assert.equal(row?.description, "The volume panel overlaps the secure streaming label.");
  assert.deepEqual(JSON.parse(row?.context_json ?? "{}"), {
    platform: "tdesktop",
    telegramVersion: "9.0",
  });
});
