import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { LibraryPayload, Playlist, TelegramUser, Track } from "@/lib/types";

type UserRow = {
  id: string;
  telegram_id: string;
  first_name: string;
  username: string | null;
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
};

type PlaylistRow = {
  id: string;
  name: string;
  description: string;
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
      added_at TEXT NOT NULL,
      UNIQUE(owner_id, telegram_file_unique_id)
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
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

    CREATE INDEX IF NOT EXISTS idx_tracks_owner_added
      ON tracks(owner_id, added_at DESC);
    CREATE INDEX IF NOT EXISTS idx_playlists_owner_created
      ON playlists(owner_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_order
      ON playlist_tracks(playlist_id, position);
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
  };
}

export function upsertUser(user: TelegramUser): UserRow {
  const db = database();
  const timestamp = now();
  const telegramId = String(user.id);
  db.prepare(`
    INSERT INTO users (id, telegram_id, first_name, username, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET
      first_name = excluded.first_name,
      username = excluded.username,
      updated_at = excluded.updated_at
  `).run(randomUUID(), telegramId, user.first_name, user.username ?? null, timestamp, timestamp);

  return db.prepare("SELECT * FROM users WHERE telegram_id = ?")
    .get(telegramId) as UserRow;
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
};

export function saveTrack(user: TelegramUser, track: IncomingTrack): Track {
  const db = database();
  const owner = upsertUser(user);
  db.prepare(`
    INSERT INTO tracks (
      id, owner_id, telegram_file_id, telegram_file_unique_id,
      source_chat_id, source_message_id, title, artist, duration,
      mime_type, file_size, added_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_id, telegram_file_unique_id) DO UPDATE SET
      telegram_file_id = excluded.telegram_file_id,
      title = excluded.title,
      artist = excluded.artist,
      duration = excluded.duration,
      mime_type = excluded.mime_type,
      file_size = excluded.file_size
  `).run(
    randomUUID(), owner.id, track.fileId, track.fileUniqueId,
    String(track.sourceChatId), track.sourceMessageId, track.title, track.artist,
    track.duration, track.mimeType ?? null, track.fileSize ?? null, now(),
  );

  const row = db.prepare(`
    SELECT * FROM tracks WHERE owner_id = ? AND telegram_file_unique_id = ?
  `).get(owner.id, track.fileUniqueId) as TrackRow;
  return toTrack(row);
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

function tracksForPlaylist(playlistId: string): Track[] {
  const rows = database().prepare(`
    SELECT t.* FROM playlist_tracks pt
    JOIN tracks t ON t.id = pt.track_id
    WHERE pt.playlist_id = ?
    ORDER BY pt.position ASC
  `).all(playlistId) as TrackRow[];
  return rows.map(toTrack);
}

export function getLibrary(user: TelegramUser): LibraryPayload {
  const db = database();
  const owner = upsertUser(user);
  seedDemoLibrary(owner.id);

  const trackRows = db.prepare(`
    SELECT * FROM tracks WHERE owner_id = ? ORDER BY added_at DESC
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
    createdAt: row.created_at,
    trackCount: Number(row.track_count),
    duration: Number(row.duration),
    tracks: tracksForPlaylist(row.id),
  }));

  return {
    user: { firstName: owner.first_name, username: owner.username },
    tracks: trackRows.map(toTrack),
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

export function addTrackToPlaylist(
  user: TelegramUser,
  playlistId: string,
  trackId: string,
): void {
  const db = database();
  const owner = upsertUser(user);
  const owns = db.prepare(`
    SELECT 1 FROM playlists p JOIN tracks t ON t.owner_id = p.owner_id
    WHERE p.id = ? AND t.id = ? AND p.owner_id = ?
  `).get(playlistId, trackId, owner.id);
  if (!owns) throw new Error("Playlist or track was not found.");
  const position = db.prepare(`
    SELECT COALESCE(MAX(position), -1) + 1 AS position
    FROM playlist_tracks WHERE playlist_id = ?
  `).get(playlistId) as { position: number };
  db.prepare(`
    INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position, added_at)
    VALUES (?, ?, ?, ?)
  `).run(playlistId, trackId, position.position, now());
}

export function removeTrackFromPlaylist(
  user: TelegramUser,
  playlistId: string,
  trackId: string,
): void {
  const db = database();
  const owner = upsertUser(user);
  const result = db.prepare(`
    DELETE FROM playlist_tracks
    WHERE playlist_id = ? AND track_id = ?
      AND playlist_id IN (SELECT id FROM playlists WHERE owner_id = ?)
  `).run(playlistId, trackId, owner.id);
  if (!result.changes) throw new Error("Playlist track was not found.");
}

export type TelegramTrack = {
  id: string;
  telegramFileId: string;
  title: string;
  artist: string;
  duration: number;
};

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
