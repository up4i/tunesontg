import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  LibraryPayload,
  Playlist,
  SharedPlaylistPreview,
  SharedSongPreview,
  TelegramUser,
  Track,
} from "@/lib/types";

type UserRow = {
  id: string;
  telegram_id: string;
  first_name: string;
  username: string | null;
  photo_url: string | null;
};

type TrackRow = {
  id: string;
  title: string;
  artist: string;
  duration: number;
  mime_type: string | null;
  file_size: number | null;
  added_at: string;
  telegram_file_id: string;
  telegram_file_unique_id: string;
  source_chat_id: string | null;
  source_message_id: number | null;
  thumbnail_file_id: string | null;
  thumbnail_unique_id: string | null;
};

type PlaylistRow = {
  id: string;
  name: string;
  description: string;
  cover_seed: number | null;
  kind: "standard" | "liked";
  visibility: "private" | "public";
  created_at: string;
  track_count: number;
  duration: number;
};

declare global {
  var __tunesDb: Database.Database | undefined;
}

function database(): Database.Database {
  if (global.__tunesDb) return global.__tunesDb;

  const path = process.env.DATABASE_PATH ?? "./data/tunes.db";
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      telegram_id TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL,
      username TEXT,
      photo_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      telegram_file_id TEXT NOT NULL,
      telegram_file_unique_id TEXT NOT NULL,
      source_chat_id TEXT,
      source_message_id INTEGER,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      duration INTEGER NOT NULL DEFAULT 0,
      mime_type TEXT,
      file_size INTEGER,
      thumbnail_file_id TEXT,
      thumbnail_unique_id TEXT,
      share_id TEXT,
      added_at TEXT NOT NULL,
      UNIQUE(owner_id, telegram_file_unique_id)
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      cover_seed INTEGER,
      kind TEXT NOT NULL DEFAULT 'standard',
      visibility TEXT NOT NULL DEFAULT 'private',
      share_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playlist_tracks (
      playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
      track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      added_at TEXT NOT NULL,
      PRIMARY KEY(playlist_id, track_id)
    );

    CREATE TABLE IF NOT EXISTS playback_history (
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      last_played_at TEXT NOT NULL,
      play_count INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY(owner_id, track_id)
    );

    CREATE TABLE IF NOT EXISTS bug_reports (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      context_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tracks_owner_added
      ON tracks(owner_id, added_at DESC);
    CREATE INDEX IF NOT EXISTS idx_playlists_owner_created
      ON playlists(owner_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_order
      ON playlist_tracks(playlist_id, position);
    CREATE INDEX IF NOT EXISTS idx_playback_history_recent
      ON playback_history(owner_id, last_played_at DESC);
    CREATE INDEX IF NOT EXISTS idx_bug_reports_created
      ON bug_reports(created_at DESC);
  `);

  const trackColumns = db.pragma("table_info(tracks)") as Array<{ name: string }>;
  if (!trackColumns.some((column) => column.name === "thumbnail_file_id")) {
    db.exec("ALTER TABLE tracks ADD COLUMN thumbnail_file_id TEXT");
  }
  if (!trackColumns.some((column) => column.name === "thumbnail_unique_id")) {
    db.exec("ALTER TABLE tracks ADD COLUMN thumbnail_unique_id TEXT");
  }
  if (!trackColumns.some((column) => column.name === "share_id")) {
    db.exec("ALTER TABLE tracks ADD COLUMN share_id TEXT");
  }
  const userColumns = db.pragma("table_info(users)") as Array<{ name: string }>;
  if (!userColumns.some((column) => column.name === "photo_url")) {
    db.exec("ALTER TABLE users ADD COLUMN photo_url TEXT");
  }
  const playlistColumns = db.pragma("table_info(playlists)") as Array<{ name: string }>;
  if (!playlistColumns.some((column) => column.name === "kind")) {
    db.exec("ALTER TABLE playlists ADD COLUMN kind TEXT NOT NULL DEFAULT 'standard'");
  }
  if (!playlistColumns.some((column) => column.name === "visibility")) {
    db.exec("ALTER TABLE playlists ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'");
  }
  if (!playlistColumns.some((column) => column.name === "share_id")) {
    db.exec("ALTER TABLE playlists ADD COLUMN share_id TEXT");
  }
  if (!playlistColumns.some((column) => column.name === "cover_seed")) {
    db.exec("ALTER TABLE playlists ADD COLUMN cover_seed INTEGER");
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_playlists_owner_liked
      ON playlists(owner_id) WHERE kind = 'liked';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tracks_share_id
      ON tracks(share_id) WHERE share_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_playlists_share_id
      ON playlists(share_id) WHERE share_id IS NOT NULL;
  `);

  global.__tunesDb = db;
  return db;
}

function now(): string {
  return new Date().toISOString();
}

function artworkSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 8;
}

function normalizeMetadata(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function toTrack(row: TrackRow): Track {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    duration: row.duration,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    addedAt: row.added_at,
    artworkSeed: artworkSeed(row.telegram_file_unique_id),
    hasArtwork: Boolean(row.thumbnail_file_id),
    playable: !row.telegram_file_id.startsWith("demo:"),
    liked: false,
  };
}

export function upsertUser(user: TelegramUser): UserRow {
  const db = database();
  const timestamp = now();
  const telegramId = String(user.id);
  db.prepare(`
    INSERT INTO users (id, telegram_id, first_name, username, photo_url, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET
      first_name = excluded.first_name,
      username = excluded.username,
      photo_url = COALESCE(excluded.photo_url, users.photo_url),
      updated_at = excluded.updated_at
  `).run(randomUUID(), telegramId, user.first_name, user.username ?? null, user.photo_url ?? null, timestamp, timestamp);

  const owner = db.prepare("SELECT * FROM users WHERE telegram_id = ?")
    .get(telegramId) as UserRow;
  db.prepare(`
    INSERT OR IGNORE INTO playlists (id, owner_id, name, description, kind, created_at, updated_at)
    VALUES (?, ?, 'Liked Songs', 'Songs you love', 'liked', ?, ?)
  `).run(randomUUID(), owner.id, timestamp, timestamp);
  return owner;
}

export type IncomingTrack = {
  fileId: string;
  fileUniqueId: string;
  sourceChatId: number;
  sourceMessageId: number;
  title: string;
  artist: string;
  duration: number;
  mimeType?: string;
  fileSize?: number;
  thumbnailFileId?: string;
  thumbnailUniqueId?: string;
};

export function saveTrackWithStatus(
  user: TelegramUser,
  track: IncomingTrack,
): { track: Track; created: boolean; possibleDuplicate: Track | null } {
  const db = database();
  const owner = upsertUser(user);
  const existing = db.prepare(`
    SELECT 1 FROM tracks WHERE owner_id = ? AND telegram_file_unique_id = ?
  `).get(owner.id, track.fileUniqueId);
  const normalizedTitle = normalizeMetadata(track.title);
  const normalizedArtist = normalizeMetadata(track.artist);
  const possibleDuplicateRow = existing || !normalizedTitle || !normalizedArtist || track.duration <= 0
    ? undefined
    : (db.prepare(`
      SELECT * FROM tracks
      WHERE owner_id = ? AND duration > 0 AND ABS(duration - ?) <= 3
      ORDER BY added_at DESC
    `).all(owner.id, track.duration) as TrackRow[]).find((candidate) =>
      normalizeMetadata(candidate.title) === normalizedTitle
      && normalizeMetadata(candidate.artist) === normalizedArtist,
    );
  db.prepare(`
    INSERT INTO tracks (
      id, owner_id, telegram_file_id, telegram_file_unique_id,
      source_chat_id, source_message_id, title, artist, duration,
      mime_type, file_size, thumbnail_file_id, thumbnail_unique_id, added_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_id, telegram_file_unique_id) DO UPDATE SET
      telegram_file_id = excluded.telegram_file_id,
      title = excluded.title,
      artist = excluded.artist,
      duration = excluded.duration,
      mime_type = excluded.mime_type,
      file_size = excluded.file_size,
      thumbnail_file_id = COALESCE(excluded.thumbnail_file_id, tracks.thumbnail_file_id),
      thumbnail_unique_id = COALESCE(excluded.thumbnail_unique_id, tracks.thumbnail_unique_id)
  `).run(
    randomUUID(), owner.id, track.fileId, track.fileUniqueId,
    String(track.sourceChatId), track.sourceMessageId, track.title, track.artist,
    track.duration, track.mimeType ?? null, track.fileSize ?? null,
    track.thumbnailFileId ?? null, track.thumbnailUniqueId ?? null, now(),
  );

  const row = db.prepare(`
    SELECT * FROM tracks WHERE owner_id = ? AND telegram_file_unique_id = ?
  `).get(owner.id, track.fileUniqueId) as TrackRow;
  return {
    track: toTrack(row),
    created: !existing,
    possibleDuplicate: possibleDuplicateRow ? toTrack(possibleDuplicateRow) : null,
  };
}

export function saveTrack(user: TelegramUser, track: IncomingTrack): Track {
  return saveTrackWithStatus(user, track).track;
}

function seedDemoLibrary(ownerId: string): void {
  const db = database();
  const count = db.prepare("SELECT COUNT(*) AS count FROM tracks WHERE owner_id = ?")
    .get(ownerId) as { count: number };
  if (count.count > 0 || process.env.NEXT_PUBLIC_DEMO_MODE !== "true") return;

  const samples = [
    ["Afterglow", "Noah Vale", 224, "demo-afterglow"],
    ["Honeyed Light", "The Marigolds", 198, "demo-honeyed-light"],
    ["Blue Hour", "Slow Motion Club", 263, "demo-blue-hour"],
    ["Little Ghosts", "Rue Bennett", 187, "demo-little-ghosts"],
    ["Keep It Close", "Mona Gray", 242, "demo-keep-it-close"],
    ["Soft Focus", "June & The Satellites", 216, "demo-soft-focus"],
  ] as const;
  const insertTrack = db.prepare(`
    INSERT OR IGNORE INTO tracks (
      id, owner_id, telegram_file_id, telegram_file_unique_id, title, artist,
      duration, mime_type, file_size, added_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'audio/mpeg', NULL, ?)
  `);
  const trackIds: string[] = [];
  samples.forEach(([title, artist, duration, uniqueId], index) => {
    const id = randomUUID();
    trackIds.push(id);
    const added = new Date(Date.now() - index * 86_400_000).toISOString();
    insertTrack.run(id, ownerId, `demo:${uniqueId}`, uniqueId, title, artist, duration, added);
  });

  const playlistId = randomUUID();
  const timestamp = now();
  db.prepare(`
    INSERT INTO playlists (id, owner_id, name, description, created_at, updated_at)
    VALUES (?, ?, 'late night drive', 'soft lights, empty roads', ?, ?)
  `).run(playlistId, ownerId, timestamp, timestamp);
  const add = db.prepare(`
    INSERT INTO playlist_tracks (playlist_id, track_id, position, added_at)
    VALUES (?, ?, ?, ?)
  `);
  trackIds.slice(0, 4).forEach((trackId, position) =>
    add.run(playlistId, trackId, position, timestamp),
  );
}

function tracksForPlaylist(playlistId: string, likedIds: Set<string>): Track[] {
  const rows = database().prepare(`
    SELECT t.* FROM playlist_tracks pt
    JOIN tracks t ON t.id = pt.track_id
    WHERE pt.playlist_id = ?
    ORDER BY pt.position ASC
  `).all(playlistId) as TrackRow[];
  return rows.map((row) => ({ ...toTrack(row), liked: likedIds.has(row.id) }));
}

export function getLibrary(user: TelegramUser): LibraryPayload {
  const db = database();
  const owner = upsertUser(user);
  seedDemoLibrary(owner.id);

  const trackRows = db.prepare(`
    SELECT * FROM tracks WHERE owner_id = ? ORDER BY added_at DESC
  `).all(owner.id) as TrackRow[];
  const likedRows = db.prepare(`
    SELECT pt.track_id FROM playlist_tracks pt
    JOIN playlists p ON p.id = pt.playlist_id
    WHERE p.owner_id = ? AND p.kind = 'liked'
  `).all(owner.id) as Array<{ track_id: string }>;
  const likedIds = new Set(likedRows.map((row) => row.track_id));
  const recentlyPlayedRows = db.prepare(`
    SELECT t.* FROM playback_history h
    JOIN tracks t ON t.id = h.track_id
    WHERE h.owner_id = ?
    ORDER BY h.last_played_at DESC
    LIMIT 50
  `).all(owner.id) as TrackRow[];
  const playlistRows = db.prepare(`
    SELECT p.*,
      COUNT(pt.track_id) AS track_count,
      COALESCE(SUM(t.duration), 0) AS duration
    FROM playlists p
    LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
    LEFT JOIN tracks t ON t.id = pt.track_id
    WHERE p.owner_id = ?
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all(owner.id) as PlaylistRow[];

  const playlists: Playlist[] = playlistRows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    coverSeed: row.cover_seed,
    kind: row.kind,
    visibility: row.visibility,
    createdAt: row.created_at,
    trackCount: Number(row.track_count),
    duration: Number(row.duration),
    tracks: tracksForPlaylist(row.id, likedIds),
  }));

  return {
    user: { firstName: owner.first_name, username: owner.username, photoUrl: owner.photo_url },
    tracks: trackRows.map((row) => ({ ...toTrack(row), liked: likedIds.has(row.id) })),
    recentlyPlayed: recentlyPlayedRows.map((row) => ({ ...toTrack(row), liked: likedIds.has(row.id) })),
    playlists,
    demo: trackRows.some((track) => track.telegram_file_id.startsWith("demo:")),
  };
}

export function createPlaylist(
  user: TelegramUser,
  input: { name: string; description?: string },
): string {
  const owner = upsertUser(user);
  const id = randomUUID();
  const timestamp = now();
  database().prepare(`
    INSERT INTO playlists (id, owner_id, name, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, owner.id, input.name, input.description ?? "", timestamp, timestamp);
  return id;
}

export function updatePlaylistDetails(
  user: TelegramUser,
  playlistId: string,
  input: { name: string; description: string; coverSeed: number | null },
): void {
  const owner = upsertUser(user);
  const result = database().prepare(`
    UPDATE playlists
    SET name = ?, description = ?, cover_seed = ?, updated_at = ?
    WHERE id = ? AND owner_id = ? AND kind = 'standard'
  `).run(input.name, input.description, input.coverSeed, now(), playlistId, owner.id);
  if (!result.changes) throw new Error("Playlist was not found.");
}

export function addTrackToPlaylist(
  user: TelegramUser,
  playlistId: string,
  trackId: string,
): void {
  addTracksToPlaylist(user, playlistId, [trackId]);
}

export function addTracksToPlaylist(
  user: TelegramUser,
  playlistId: string,
  trackIds: string[],
): number {
  const db = database();
  const owner = upsertUser(user);
  const uniqueTrackIds = [...new Set(trackIds)];
  if (!uniqueTrackIds.length) return 0;
  const ownsPlaylist = db.prepare(`
    SELECT 1 FROM playlists WHERE id = ? AND owner_id = ?
  `).get(playlistId, owner.id);
  if (!ownsPlaylist) throw new Error("Playlist was not found.");
  const placeholders = uniqueTrackIds.map(() => "?").join(",");
  const ownedTracks = db.prepare(`
    SELECT id FROM tracks WHERE owner_id = ? AND id IN (${placeholders})
  `).all(owner.id, ...uniqueTrackIds) as Array<{ id: string }>;
  if (ownedTracks.length !== uniqueTrackIds.length) throw new Error("One or more tracks were not found.");
  const position = db.prepare(`
    SELECT COALESCE(MAX(position), -1) + 1 AS position
    FROM playlist_tracks WHERE playlist_id = ?
  `).get(playlistId) as { position: number };
  const insert = db.prepare(`
    INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position, added_at)
    VALUES (?, ?, ?, ?)
  `);
  return db.transaction(() => {
    let nextPosition = position.position;
    let added = 0;
    for (const trackId of uniqueTrackIds) {
      const result = insert.run(playlistId, trackId, nextPosition, now());
      if (result.changes) {
        nextPosition += 1;
        added += 1;
      }
    }
    return added;
  })();
}

export function deletePlaylist(user: TelegramUser, playlistId: string): void {
  const owner = upsertUser(user);
  const result = database().prepare(`
    DELETE FROM playlists WHERE id = ? AND owner_id = ? AND kind = 'standard'
  `).run(playlistId, owner.id);
  if (!result.changes) throw new Error("Playlist was not found.");
}

export function setTrackLiked(user: TelegramUser, trackId: string, liked: boolean): void {
  setTracksLiked(user, [trackId], liked);
}

export function setTracksLiked(user: TelegramUser, trackIds: string[], liked: boolean): number {
  const db = database();
  const owner = upsertUser(user);
  const uniqueTrackIds = [...new Set(trackIds)];
  if (!uniqueTrackIds.length) return 0;
  const placeholders = uniqueTrackIds.map(() => "?").join(",");
  const owned = db.prepare(`
    SELECT id FROM tracks WHERE owner_id = ? AND id IN (${placeholders})
  `).all(owner.id, ...uniqueTrackIds) as Array<{ id: string }>;
  if (owned.length !== uniqueTrackIds.length) throw new Error("One or more tracks were not found.");
  const playlist = db.prepare("SELECT id FROM playlists WHERE owner_id = ? AND kind = 'liked'")
    .get(owner.id) as { id: string };
  if (!liked) {
    return Number(db.prepare(`
      DELETE FROM playlist_tracks
      WHERE playlist_id = ? AND track_id IN (${placeholders})
    `).run(playlist.id, ...uniqueTrackIds).changes);
  }
  const position = db.prepare(`
    SELECT COALESCE(MAX(position), -1) + 1 AS position
    FROM playlist_tracks WHERE playlist_id = ?
  `).get(playlist.id) as { position: number };
  const insert = db.prepare(`
    INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position, added_at)
    VALUES (?, ?, ?, ?)
  `);
  return db.transaction(() => {
    let nextPosition = position.position;
    let changed = 0;
    for (const trackId of uniqueTrackIds) {
      const result = insert.run(playlist.id, trackId, nextPosition, now());
      if (result.changes) {
        nextPosition += 1;
        changed += 1;
      }
    }
    return changed;
  })();
}

export function recordTrackPlayed(user: TelegramUser, trackId: string): void {
  const db = database();
  const owner = upsertUser(user);
  const track = db.prepare("SELECT 1 FROM tracks WHERE id = ? AND owner_id = ?")
    .get(trackId, owner.id);
  if (!track) throw new Error("Track was not found.");
  db.prepare(`
    INSERT INTO playback_history (owner_id, track_id, last_played_at, play_count)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(owner_id, track_id) DO UPDATE SET
      last_played_at = excluded.last_played_at,
      play_count = playback_history.play_count + 1
  `).run(owner.id, trackId, now());
}

function createShareId(): string {
  return randomUUID().replaceAll("-", "");
}

export function createTrackShare(user: TelegramUser, trackId: string): string {
  const db = database();
  const owner = upsertUser(user);
  db.prepare(`
    UPDATE tracks SET share_id = COALESCE(share_id, ?)
    WHERE id = ? AND owner_id = ?
  `).run(createShareId(), trackId, owner.id);
  const track = db.prepare("SELECT share_id FROM tracks WHERE id = ? AND owner_id = ?")
    .get(trackId, owner.id) as { share_id: string | null } | undefined;
  if (!track?.share_id) throw new Error("Track was not found.");
  return track.share_id;
}

export function setPlaylistVisibility(
  user: TelegramUser,
  playlistId: string,
  visibility: "private" | "public",
): void {
  const owner = upsertUser(user);
  const result = database().prepare(`
    UPDATE playlists SET visibility = ?, updated_at = ?
    WHERE id = ? AND owner_id = ? AND kind = 'standard'
  `).run(visibility, now(), playlistId, owner.id);
  if (!result.changes) throw new Error("Playlist was not found.");
}

export function createPlaylistShare(user: TelegramUser, playlistId: string): string {
  const db = database();
  const owner = upsertUser(user);
  const playlist = db.prepare(`
    SELECT visibility FROM playlists
    WHERE id = ? AND owner_id = ? AND kind = 'standard'
  `).get(playlistId, owner.id) as { visibility: "private" | "public" } | undefined;
  if (!playlist) throw new Error("Playlist was not found.");
  if (playlist.visibility !== "public") throw new Error("Make this playlist public before sharing it.");
  db.prepare(`
    UPDATE playlists SET share_id = COALESCE(share_id, ?), updated_at = ?
    WHERE id = ? AND owner_id = ?
  `).run(createShareId(), now(), playlistId, owner.id);
  const shared = db.prepare("SELECT share_id FROM playlists WHERE id = ? AND owner_id = ?")
    .get(playlistId, owner.id) as { share_id: string };
  return shared.share_id;
}

export function getSharedSongPreview(user: TelegramUser, shareId: string): SharedSongPreview | null {
  const db = database();
  const recipient = upsertUser(user);
  const row = db.prepare(`
    SELECT t.title, t.artist, t.duration, t.telegram_file_unique_id, u.first_name AS owner_name,
      EXISTS(
        SELECT 1 FROM tracks own
        WHERE own.owner_id = ? AND own.telegram_file_unique_id = t.telegram_file_unique_id
      ) AS already_added
    FROM tracks t
    JOIN users u ON u.id = t.owner_id
    WHERE t.share_id = ?
  `).get(recipient.id, shareId) as {
    title: string;
    artist: string;
    duration: number;
    telegram_file_unique_id: string;
    owner_name: string;
    already_added: number;
  } | undefined;
  return row ? {
    type: "song",
    shareId,
    title: row.title,
    artist: row.artist,
    duration: row.duration,
    artworkSeed: artworkSeed(row.telegram_file_unique_id),
    ownerName: row.owner_name,
    alreadyAdded: Boolean(row.already_added),
  } : null;
}

export function importSharedSong(
  user: TelegramUser,
  shareId: string,
): { track: Track; created: boolean; possibleDuplicate: Track | null } {
  const row = database().prepare("SELECT * FROM tracks WHERE share_id = ?")
    .get(shareId) as TrackRow | undefined;
  if (!row) throw new Error("Shared song was not found.");
  return saveTrackWithStatus(user, {
    fileId: row.telegram_file_id,
    fileUniqueId: row.telegram_file_unique_id,
    sourceChatId: Number(row.source_chat_id ?? 0),
    sourceMessageId: row.source_message_id ?? 0,
    title: row.title,
    artist: row.artist,
    duration: row.duration,
    mimeType: row.mime_type ?? undefined,
    fileSize: row.file_size ?? undefined,
    thumbnailFileId: row.thumbnail_file_id ?? undefined,
    thumbnailUniqueId: row.thumbnail_unique_id ?? undefined,
  });
}

export function getSharedPlaylistPreview(shareId: string): SharedPlaylistPreview | null {
  const db = database();
  const playlist = db.prepare(`
    SELECT p.id, p.name, p.description, u.first_name AS owner_name
    FROM playlists p
    JOIN users u ON u.id = p.owner_id
    WHERE p.share_id = ? AND p.visibility = 'public' AND p.kind = 'standard'
  `).get(shareId) as {
    id: string;
    name: string;
    description: string;
    owner_name: string;
  } | undefined;
  if (!playlist) return null;
  const tracks = tracksForPlaylist(playlist.id, new Set());
  return {
    type: "playlist",
    shareId,
    name: playlist.name,
    description: playlist.description,
    ownerName: playlist.owner_name,
    trackCount: tracks.length,
    duration: tracks.reduce((total, track) => total + track.duration, 0),
    tracks: tracks.map(({ title, artist, duration, artworkSeed }) => ({ title, artist, duration, artworkSeed })),
  };
}

export function removeTrackFromPlaylist(
  user: TelegramUser,
  playlistId: string,
  trackId: string,
): void {
  removeTracksFromPlaylist(user, playlistId, [trackId]);
}

export function removeTracksFromPlaylist(
  user: TelegramUser,
  playlistId: string,
  trackIds: string[],
): number {
  const db = database();
  const owner = upsertUser(user);
  const uniqueTrackIds = [...new Set(trackIds)];
  if (!uniqueTrackIds.length) return 0;
  const placeholders = uniqueTrackIds.map(() => "?").join(",");
  const result = db.prepare(`
    DELETE FROM playlist_tracks
    WHERE playlist_id = ? AND track_id IN (${placeholders})
      AND playlist_id IN (SELECT id FROM playlists WHERE owner_id = ?)
  `).run(playlistId, ...uniqueTrackIds, owner.id);
  if (!result.changes) throw new Error("Playlist track was not found.");
  return Number(result.changes);
}

export function deleteTracks(user: TelegramUser, trackIds: string[]): number {
  const db = database();
  const owner = upsertUser(user);
  const uniqueTrackIds = [...new Set(trackIds)];
  if (!uniqueTrackIds.length) return 0;
  const placeholders = uniqueTrackIds.map(() => "?").join(",");
  const owned = db.prepare(`
    SELECT id FROM tracks WHERE owner_id = ? AND id IN (${placeholders})
  `).all(owner.id, ...uniqueTrackIds) as Array<{ id: string }>;
  if (owned.length !== uniqueTrackIds.length) throw new Error("One or more tracks were not found.");
  return Number(db.prepare(`
    DELETE FROM tracks WHERE owner_id = ? AND id IN (${placeholders})
  `).run(owner.id, ...uniqueTrackIds).changes);
}

export function createBugReport(
  user: TelegramUser,
  input: {
    description: string;
    context: Record<string, string | number | boolean | null>;
  },
): string {
  const owner = upsertUser(user);
  const id = randomUUID();
  database().prepare(`
    INSERT INTO bug_reports (id, owner_id, description, context_json, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, owner.id, input.description, JSON.stringify(input.context), now());
  return id;
}

export type TelegramTrack = {
  id: string;
  telegramFileId: string;
  title: string;
  artist: string;
  duration: number;
};

export type PlaybackFile = {
  telegramFileId: string;
  thumbnailFileId: string | null;
  mimeType: string | null;
  fileSize: number | null;
  title: string;
  artist: string;
};

export function getPlaybackFile(telegramId: string, trackId: string): PlaybackFile | null {
  const row = database().prepare(`
    SELECT t.telegram_file_id, t.thumbnail_file_id, t.mime_type, t.file_size,
      t.title, t.artist
    FROM tracks t
    JOIN users u ON u.id = t.owner_id
    WHERE u.telegram_id = ? AND t.id = ?
  `).get(telegramId, trackId) as {
    telegram_file_id: string;
    thumbnail_file_id: string | null;
    mime_type: string | null;
    file_size: number | null;
    title: string;
    artist: string;
  } | undefined;
  return row ? {
    telegramFileId: row.telegram_file_id,
    thumbnailFileId: row.thumbnail_file_id,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    title: row.title,
    artist: row.artist,
  } : null;
}

export function getOwnedTracks(user: TelegramUser, trackIds: string[]): TelegramTrack[] {
  if (!trackIds.length) return [];
  const owner = upsertUser(user);
  const placeholders = trackIds.map(() => "?").join(",");
  const rows = database().prepare(`
    SELECT id, telegram_file_id, title, artist, duration
    FROM tracks WHERE owner_id = ? AND id IN (${placeholders})
  `).all(owner.id, ...trackIds) as Array<{
    id: string;
    telegram_file_id: string;
    title: string;
    artist: string;
    duration: number;
  }>;
  const byId = new Map(rows.map((row) => [row.id, row]));
  return trackIds.flatMap((id) => {
    const row = byId.get(id);
    return row ? [{
      id: row.id,
      telegramFileId: row.telegram_file_id,
      title: row.title,
      artist: row.artist,
      duration: row.duration,
    }] : [];
  });
}
