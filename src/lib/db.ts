import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  LibraryPayload,
  Playlist,
  SharedPlaylistPreview,
  SharedProfilePreview,
  SharedSongPreview,
  TelegramUser,
  Track,
} from "@/lib/types";
import { MAX_TELEGRAM_DOWNLOAD_BYTES, MAX_TRACK_DURATION_SECONDS } from "@/lib/media-limits";

export { MAX_TRACK_DURATION_SECONDS } from "@/lib/media-limits";

type UserRow = {
  id: string;
  telegram_id: string;
  first_name: string;
  display_name: string;
  bio: string;
  username: string | null;
  photo_url: string | null;
  custom_photo: string | null;
  public_id: string;
};

type TrackRow = {
  id: string;
  owner_id: string;
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
  custom_artwork: string | null;
  owner_name?: string;
  accessible_as?: "owned" | "collaborator" | "public";
};

type PlaylistRow = {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  cover_seed: number | null;
  cover_image: string | null;
  kind: "standard" | "liked";
  visibility: "private" | "public";
  collaborative: number;
  folder_id: string | null;
  created_at: string;
  track_count: number;
  duration: number;
  owner_name?: string;
  access?: "owner" | "collaborator";
  follower_count?: number;
  collaborator_count?: number;
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
      display_name TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      username TEXT,
      photo_url TEXT,
      custom_photo TEXT,
      public_id TEXT,
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
      custom_artwork TEXT,
      share_id TEXT,
      added_at TEXT NOT NULL,
      UNIQUE(owner_id, telegram_file_unique_id)
    );

    CREATE TABLE IF NOT EXISTS playlist_folders (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(owner_id, name)
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      cover_seed INTEGER,
      cover_image TEXT,
      kind TEXT NOT NULL DEFAULT 'standard',
      visibility TEXT NOT NULL DEFAULT 'private',
      collaborative INTEGER NOT NULL DEFAULT 0,
      folder_id TEXT REFERENCES playlist_folders(id) ON DELETE SET NULL,
      share_id TEXT,
      source_share_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playback_events (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      track_id TEXT REFERENCES tracks(id) ON DELETE SET NULL,
      session_id TEXT NOT NULL,
      event TEXT NOT NULL,
      startup_ms INTEGER,
      position_seconds REAL,
      detail TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS import_events (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playlist_follows (
      follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY(follower_id, playlist_id)
    );

    CREATE TABLE IF NOT EXISTS playlist_collaborators (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
      joined_at TEXT NOT NULL,
      PRIMARY KEY(user_id, playlist_id)
    );

    CREATE TABLE IF NOT EXISTS collaboration_departures (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
      left_at TEXT NOT NULL,
      PRIMARY KEY(user_id, playlist_id)
    );

    CREATE TABLE IF NOT EXISTS activity_notifications (
      id TEXT PRIMARY KEY,
      recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
      actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL DEFAULT 'collaboration',
      event_count INTEGER NOT NULL DEFAULT 1,
      message TEXT NOT NULL,
      read_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notification_preferences (
      owner_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      collaboration_activity INTEGER NOT NULL DEFAULT 1,
      playlist_updates INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playlist_activity (
      id TEXT PRIMARY KEY,
      playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
      actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      track_id TEXT REFERENCES tracks(id) ON DELETE SET NULL,
      track_title TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('added', 'removed')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_blocks (
      blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY(blocker_id, blocked_id),
      CHECK(blocker_id != blocked_id)
    );

    CREATE TABLE IF NOT EXISTS content_reports (
      id TEXT PRIMARY KEY,
      reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL CHECK(target_type IN ('profile', 'playlist')),
      target_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recommendation_dismissals (
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY(owner_id, track_id)
    );

    CREATE TABLE IF NOT EXISTS user_actions (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      target_id TEXT NOT NULL,
      created_at TEXT NOT NULL
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
    CREATE INDEX IF NOT EXISTS idx_playback_events_owner_created
      ON playback_events(owner_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_import_events_owner_created
      ON import_events(owner_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_playlist_follows_playlist
      ON playlist_follows(playlist_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_playlist_collaborators_playlist
      ON playlist_collaborators(playlist_id, joined_at DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_notifications_recipient
      ON activity_notifications(recipient_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_playlist_activity_playlist
      ON playlist_activity(playlist_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_content_reports_created
      ON content_reports(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_user_actions_owner
      ON user_actions(owner_id, action, created_at DESC);
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
  if (!trackColumns.some((column) => column.name === "custom_artwork")) {
    db.exec("ALTER TABLE tracks ADD COLUMN custom_artwork TEXT");
  }
  const userColumns = db.pragma("table_info(users)") as Array<{ name: string }>;
  if (!userColumns.some((column) => column.name === "photo_url")) {
    db.exec("ALTER TABLE users ADD COLUMN photo_url TEXT");
  }
  if (!userColumns.some((column) => column.name === "display_name")) {
    db.exec("ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT ''");
  }
  if (!userColumns.some((column) => column.name === "bio")) {
    db.exec("ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT ''");
  }
  if (!userColumns.some((column) => column.name === "custom_photo")) {
    db.exec("ALTER TABLE users ADD COLUMN custom_photo TEXT");
  }
  if (!userColumns.some((column) => column.name === "public_id")) {
    db.exec("ALTER TABLE users ADD COLUMN public_id TEXT");
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
  if (!playlistColumns.some((column) => column.name === "cover_image")) {
    db.exec("ALTER TABLE playlists ADD COLUMN cover_image TEXT");
  }
  if (!playlistColumns.some((column) => column.name === "source_share_id")) {
    db.exec("ALTER TABLE playlists ADD COLUMN source_share_id TEXT");
  }
  if (!playlistColumns.some((column) => column.name === "collaborative")) {
    db.exec("ALTER TABLE playlists ADD COLUMN collaborative INTEGER NOT NULL DEFAULT 0");
  }
  if (!playlistColumns.some((column) => column.name === "folder_id")) {
    db.exec("ALTER TABLE playlists ADD COLUMN folder_id TEXT");
  }
  const notificationColumns = db.pragma("table_info(activity_notifications)") as Array<{ name: string }>;
  if (!notificationColumns.some((column) => column.name === "event_type")) {
    db.exec("ALTER TABLE activity_notifications ADD COLUMN event_type TEXT NOT NULL DEFAULT 'collaboration'");
  }
  if (!notificationColumns.some((column) => column.name === "event_count")) {
    db.exec("ALTER TABLE activity_notifications ADD COLUMN event_count INTEGER NOT NULL DEFAULT 1");
  }
  const usersMissingPublicId = db.prepare("SELECT id FROM users WHERE public_id IS NULL OR public_id = ''")
    .all() as Array<{ id: string }>;
  const setPublicId = db.prepare("UPDATE users SET public_id = ?, display_name = COALESCE(NULLIF(display_name, ''), first_name) WHERE id = ?");
  for (const existingUser of usersMissingPublicId) setPublicId.run(randomUUID().replaceAll("-", ""), existingUser.id);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_playlists_owner_liked
      ON playlists(owner_id) WHERE kind = 'liked';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tracks_share_id
      ON tracks(share_id) WHERE share_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_playlists_share_id
      ON playlists(share_id) WHERE share_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_playlists_owner_source_share
      ON playlists(owner_id, source_share_id) WHERE source_share_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_public_id
      ON users(public_id) WHERE public_id IS NOT NULL;
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

function artworkRevision(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeMetadata(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function toTrack(
  row: TrackRow,
  viewerOwnerId = row.owner_id,
  externalAccess: "collaborator" | "public" = "collaborator",
): Track {
  const owned = row.owner_id === viewerOwnerId;
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    duration: row.duration,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    addedAt: row.added_at,
    artworkSeed: artworkSeed(row.telegram_file_unique_id),
    artworkRevision: artworkRevision(row.custom_artwork ?? row.thumbnail_unique_id ?? row.telegram_file_unique_id),
    hasArtwork: Boolean(row.custom_artwork || row.thumbnail_file_id),
    hasCustomArtwork: Boolean(row.custom_artwork),
    playable: !row.telegram_file_id.startsWith("demo:"),
    liked: false,
    owned,
    access: owned ? "owned" : externalAccess,
    ownerName: owned ? null : row.owner_name ?? "Another listener",
  };
}

export function upsertUser(user: TelegramUser): UserRow {
  const db = database();
  const timestamp = now();
  const telegramId = String(user.id);
  db.prepare(`
    INSERT INTO users (
      id, telegram_id, first_name, display_name, bio, username,
      photo_url, custom_photo, public_id, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, '', ?, ?, NULL, ?, ?, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET
      first_name = excluded.first_name,
      username = excluded.username,
      photo_url = COALESCE(excluded.photo_url, users.photo_url),
      updated_at = excluded.updated_at
  `).run(
    randomUUID(), telegramId, user.first_name, user.first_name,
    user.username ?? null, user.photo_url ?? null,
    randomUUID().replaceAll("-", ""), timestamp, timestamp,
  );

  const owner = db.prepare("SELECT * FROM users WHERE telegram_id = ?")
    .get(telegramId) as UserRow;
  db.prepare(`
    INSERT OR IGNORE INTO playlists (id, owner_id, name, description, kind, created_at, updated_at)
    VALUES (?, ?, 'Liked Songs', 'Songs you love', 'liked', ?, ?)
  `).run(randomUUID(), owner.id, timestamp, timestamp);
  db.prepare(`
    INSERT OR IGNORE INTO notification_preferences (
      owner_id, collaboration_activity, playlist_updates, updated_at
    ) VALUES (?, 1, 1, ?)
  `).run(owner.id, timestamp);
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
  customArtwork?: string;
  preserveExistingMetadata?: boolean;
};

export function saveTrackWithStatus(
  user: TelegramUser,
  track: IncomingTrack,
): { track: Track; created: boolean; possibleDuplicate: Track | null } {
  if (track.duration > MAX_TRACK_DURATION_SECONDS) {
    throw new Error("Songs can be up to 10 minutes long.");
  }
  if (track.fileSize && track.fileSize > MAX_TELEGRAM_DOWNLOAD_BYTES) {
    throw new Error("Songs must be 20 MB or smaller with Telegram’s hosted Bot API.");
  }
  const db = database();
  const owner = upsertUser(user);
  const existing = db.prepare(`
    SELECT 1 FROM tracks WHERE owner_id = ? AND telegram_file_unique_id = ?
  `).get(owner.id, track.fileUniqueId);
  if (existing && track.preserveExistingMetadata) {
    db.prepare(`
      UPDATE tracks SET
        telegram_file_id = ?,
        thumbnail_file_id = COALESCE(thumbnail_file_id, ?),
        thumbnail_unique_id = COALESCE(thumbnail_unique_id, ?)
      WHERE owner_id = ? AND telegram_file_unique_id = ?
    `).run(track.fileId, track.thumbnailFileId ?? null, track.thumbnailUniqueId ?? null, owner.id, track.fileUniqueId);
    const existingRow = db.prepare(`
      SELECT * FROM tracks WHERE owner_id = ? AND telegram_file_unique_id = ?
    `).get(owner.id, track.fileUniqueId) as TrackRow;
    return { track: toTrack(existingRow), created: false, possibleDuplicate: null };
  }
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
      mime_type, file_size, thumbnail_file_id, thumbnail_unique_id, custom_artwork, added_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_id, telegram_file_unique_id) DO UPDATE SET
      telegram_file_id = excluded.telegram_file_id,
      title = excluded.title,
      artist = excluded.artist,
      duration = excluded.duration,
      mime_type = excluded.mime_type,
      file_size = excluded.file_size,
      thumbnail_file_id = COALESCE(excluded.thumbnail_file_id, tracks.thumbnail_file_id),
      thumbnail_unique_id = COALESCE(excluded.thumbnail_unique_id, tracks.thumbnail_unique_id),
      custom_artwork = COALESCE(tracks.custom_artwork, excluded.custom_artwork)
  `).run(
    randomUUID(), owner.id, track.fileId, track.fileUniqueId,
    String(track.sourceChatId), track.sourceMessageId, track.title, track.artist,
    track.duration, track.mimeType ?? null, track.fileSize ?? null,
    track.thumbnailFileId ?? null, track.thumbnailUniqueId ?? null, track.customArtwork ?? null, now(),
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

function tracksForPlaylist(
  playlistId: string,
  likedIds: Set<string>,
  viewerOwnerId?: string,
  externalAccess: "collaborator" | "public" = "collaborator",
): Track[] {
  const rows = database().prepare(`
    SELECT t.*, COALESCE(NULLIF(u.display_name, ''), u.first_name) AS owner_name FROM playlist_tracks pt
    JOIN tracks t ON t.id = pt.track_id
    JOIN users u ON u.id = t.owner_id
    WHERE pt.playlist_id = ?
    ORDER BY pt.position ASC
  `).all(playlistId) as TrackRow[];
  return rows.map((row) => ({ ...toTrack(row, viewerOwnerId, externalAccess), liked: likedIds.has(row.id) }));
}

export function getLibrary(user: TelegramUser): LibraryPayload {
  const db = database();
  const owner = upsertUser(user);
  seedDemoLibrary(owner.id);

  const trackRows = db.prepare(`
    SELECT * FROM tracks WHERE owner_id = ? ORDER BY added_at DESC
  `).all(owner.id) as TrackRow[];
  const availableTrackRows = db.prepare(`
    SELECT DISTINCT t.*, COALESCE(NULLIF(track_owner.display_name, ''), track_owner.first_name) AS owner_name,
      CASE
        WHEN t.owner_id = ? THEN 'owned'
        WHEN EXISTS(
          SELECT 1 FROM playlist_tracks apt
          JOIN playlist_collaborators apc ON apc.playlist_id = apt.playlist_id
          WHERE apt.track_id = t.id AND apc.user_id = ?
        ) THEN 'collaborator'
        ELSE 'public'
      END AS accessible_as
    FROM tracks t
    JOIN users track_owner ON track_owner.id = t.owner_id
    WHERE (t.owner_id = ? OR EXISTS(
      SELECT 1 FROM playlist_tracks apt
      JOIN playlists ap ON ap.id = apt.playlist_id
      LEFT JOIN playlist_collaborators apc ON apc.playlist_id = ap.id AND apc.user_id = ?
      LEFT JOIN playlist_follows apf ON apf.playlist_id = ap.id AND apf.follower_id = ?
      WHERE apt.track_id = t.id AND (apc.user_id IS NOT NULL OR (ap.visibility = 'public' AND apf.follower_id IS NOT NULL))
    ) OR EXISTS(
      SELECT 1 FROM playback_history aph WHERE aph.owner_id = ? AND aph.track_id = t.id
    )) AND NOT EXISTS(
      SELECT 1 FROM user_blocks ub
      WHERE (ub.blocker_id = ? AND ub.blocked_id = t.owner_id)
         OR (ub.blocker_id = t.owner_id AND ub.blocked_id = ?)
    )
    ORDER BY t.added_at DESC
  `).all(owner.id, owner.id, owner.id, owner.id, owner.id, owner.id, owner.id, owner.id) as TrackRow[];
  const likedRows = db.prepare(`
    SELECT pt.track_id FROM playlist_tracks pt
    JOIN playlists p ON p.id = pt.playlist_id
    WHERE p.owner_id = ? AND p.kind = 'liked'
  `).all(owner.id) as Array<{ track_id: string }>;
  const likedIds = new Set(likedRows.map((row) => row.track_id));
  const recentlyPlayedRows = db.prepare(`
    SELECT t.* FROM playback_history h
    JOIN tracks t ON t.id = h.track_id
    WHERE h.owner_id = ? AND (
      t.owner_id = ? OR EXISTS(
        SELECT 1 FROM playlist_tracks pt
        JOIN playlists p ON p.id = pt.playlist_id
        LEFT JOIN playlist_collaborators pc ON pc.playlist_id = pt.playlist_id AND pc.user_id = ?
        WHERE pt.track_id = t.id AND (pc.user_id IS NOT NULL OR p.visibility = 'public')
      )
    ) AND NOT EXISTS(
      SELECT 1 FROM user_blocks ub
      WHERE (ub.blocker_id = ? AND ub.blocked_id = t.owner_id)
         OR (ub.blocker_id = t.owner_id AND ub.blocked_id = ?)
    )
    ORDER BY h.last_played_at DESC
    LIMIT 50
  `).all(owner.id, owner.id, owner.id, owner.id, owner.id) as TrackRow[];
  const playlistRows = db.prepare(`
    SELECT p.*, COALESCE(NULLIF(u.display_name, ''), u.first_name) AS owner_name,
      CASE WHEN p.owner_id = ? THEN 'owner' ELSE 'collaborator' END AS access,
      COUNT(pt.track_id) AS track_count,
      COALESCE(SUM(t.duration), 0) AS duration,
      (SELECT COUNT(*) FROM playlist_follows pf WHERE pf.playlist_id = p.id) AS follower_count,
      (SELECT COUNT(*) FROM playlist_collaborators pc2 WHERE pc2.playlist_id = p.id) AS collaborator_count
    FROM playlists p
    JOIN users u ON u.id = p.owner_id
    LEFT JOIN playlist_collaborators access_row ON access_row.playlist_id = p.id AND access_row.user_id = ?
    LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
    LEFT JOIN tracks t ON t.id = pt.track_id
    WHERE p.owner_id = ? OR access_row.user_id = ?
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all(owner.id, owner.id, owner.id, owner.id) as PlaylistRow[];

  const playlists: Playlist[] = playlistRows.map((row) => {
    const collaborators = row.access === "owner" ? db.prepare(`
      SELECT u.public_id, COALESCE(NULLIF(u.display_name, ''), u.first_name) AS display_name,
        u.custom_photo, u.photo_url, pc.joined_at
      FROM playlist_collaborators pc
      JOIN users u ON u.id = pc.user_id
      WHERE pc.playlist_id = ?
      ORDER BY pc.joined_at ASC
    `).all(row.id) as Array<{
      public_id: string; display_name: string; custom_photo: string | null;
      photo_url: string | null; joined_at: string;
    }> : [];
    const activity = db.prepare(`
      SELECT pa.id, pa.action, pa.track_id, pa.track_title, pa.created_at,
        COALESCE(NULLIF(u.display_name, ''), u.first_name) AS actor_name
      FROM playlist_activity pa
      JOIN users u ON u.id = pa.actor_id
      WHERE pa.playlist_id = ?
      ORDER BY pa.created_at DESC
      LIMIT 20
    `).all(row.id) as Array<{
      id: string; action: "added" | "removed"; track_id: string | null;
      track_title: string; created_at: string; actor_name: string;
    }>;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      coverSeed: row.cover_seed,
      coverImage: row.cover_image,
      kind: row.kind,
      visibility: row.visibility,
      access: row.access ?? "owner",
      ownerName: row.owner_name ?? owner.display_name ?? owner.first_name,
      collaborative: Boolean(row.collaborative),
      folderId: row.access === "collaborator" ? null : row.folder_id,
      followerCount: Number(row.follower_count ?? 0),
      collaboratorCount: Number(row.collaborator_count ?? 0),
      collaborators: collaborators.map((collaborator) => ({
        publicId: collaborator.public_id,
        displayName: collaborator.display_name,
        photoUrl: collaborator.custom_photo
          ? `/api/profiles/${collaborator.public_id}/photo?v=${artworkRevision(collaborator.custom_photo)}`
          : collaborator.photo_url,
        joinedAt: collaborator.joined_at,
      })),
      activity: activity.map((item) => ({
        id: item.id,
        action: item.action,
        trackId: item.track_id,
        trackTitle: item.track_title,
        actorName: item.actor_name,
        createdAt: item.created_at,
      })),
      createdAt: row.created_at,
      trackCount: Number(row.track_count),
      duration: Number(row.duration),
      tracks: tracksForPlaylist(row.id, likedIds, owner.id),
    };
  });

  const folderRows = db.prepare(`
    SELECT f.id, f.name, COUNT(p.id) AS playlist_count
    FROM playlist_folders f
    LEFT JOIN playlists p ON p.folder_id = f.id AND p.owner_id = f.owner_id
    WHERE f.owner_id = ?
    GROUP BY f.id
    ORDER BY f.name COLLATE NOCASE ASC
  `).all(owner.id) as Array<{ id: string; name: string; playlist_count: number }>;
  const followedRows = db.prepare(`
    SELECT p.id AS playlist_id, p.share_id, p.name, p.description, p.cover_seed, p.cover_image,
      p.collaborative, pf.created_at AS followed_at,
      COALESCE(NULLIF(u.display_name, ''), u.first_name) AS owner_name,
      COUNT(pt.track_id) AS track_count, COALESCE(SUM(t.duration), 0) AS duration
    FROM playlist_follows pf
    JOIN playlists p ON p.id = pf.playlist_id AND p.visibility = 'public'
    JOIN users u ON u.id = p.owner_id
    LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
    LEFT JOIN tracks t ON t.id = pt.track_id
    WHERE pf.follower_id = ? AND p.owner_id != ?
    GROUP BY p.id
    ORDER BY pf.created_at DESC
  `).all(owner.id, owner.id) as Array<{
    playlist_id: string; share_id: string; name: string; description: string;
    cover_seed: number | null; cover_image: string | null; collaborative: number;
    followed_at: string; owner_name: string; track_count: number; duration: number;
  }>;
  const notificationRows = db.prepare(`
    SELECT n.id, n.playlist_id, p.name AS playlist_name, n.message, n.event_count, n.read_at, n.created_at
    FROM activity_notifications n
    JOIN playlists p ON p.id = n.playlist_id
    WHERE n.recipient_id = ?
    ORDER BY n.created_at DESC
    LIMIT 30
  `).all(owner.id) as Array<{
    id: string; playlist_id: string; playlist_name: string; message: string; event_count: number;
    read_at: string | null; created_at: string;
  }>;
  const unreadNotificationRow = db.prepare(`
    SELECT COUNT(*) AS count FROM activity_notifications
    WHERE recipient_id = ? AND read_at IS NULL
  `).get(owner.id) as { count: number };
  const preferences = db.prepare(`
    SELECT collaboration_activity, playlist_updates
    FROM notification_preferences WHERE owner_id = ?
  `).get(owner.id) as { collaboration_activity: number; playlist_updates: number };
  const blockedRows = db.prepare(`
    SELECT u.public_id, COALESCE(NULLIF(u.display_name, ''), u.first_name) AS display_name,
      u.custom_photo, u.photo_url, ub.created_at
    FROM user_blocks ub
    JOIN users u ON u.id = ub.blocked_id
    WHERE ub.blocker_id = ?
    ORDER BY ub.created_at DESC
  `).all(owner.id) as Array<{
    public_id: string; display_name: string; custom_photo: string | null;
    photo_url: string | null; created_at: string;
  }>;
  const dismissedRows = db.prepare("SELECT track_id FROM recommendation_dismissals WHERE owner_id = ?")
    .all(owner.id) as Array<{ track_id: string }>;
  const dismissedIds = new Set(dismissedRows.map((row) => row.track_id));
  const historyIds = new Set(recentlyPlayedRows.map((row) => row.id));
  const likedArtists = new Set(trackRows.filter((row) => likedIds.has(row.id)).map((row) => normalizeMetadata(row.artist)));
  const recommendations = (historyIds.size || likedIds.size ? trackRows.filter((row) => !dismissedIds.has(row.id)) : [])
    .map((row, index) => ({
      row,
      score: (likedArtists.has(normalizeMetadata(row.artist)) && !likedIds.has(row.id) ? 5 : 0)
        + (!historyIds.has(row.id) ? 3 : 0)
        + (likedIds.has(row.id) ? 1 : 0)
        + Math.max(0, 2 - index / Math.max(1, trackRows.length)),
    }))
    .sort((left, right) => right.score - left.score || right.row.added_at.localeCompare(left.row.added_at))
    .slice(0, 8)
    .map(({ row }) => ({
      ...toTrack(row, owner.id),
      liked: likedIds.has(row.id),
      recommendationReason: likedArtists.has(normalizeMetadata(row.artist)) && !likedIds.has(row.id)
        ? `Because you liked other songs by ${row.artist}`
        : !historyIds.has(row.id)
          ? "A track from your library you have not played recently"
          : "Based on your recent listening",
    }));

  return {
    user: {
      firstName: owner.first_name,
      displayName: owner.display_name || owner.first_name,
      bio: owner.bio,
      username: owner.username,
      photoUrl: owner.custom_photo
        ? `/api/profiles/${owner.public_id}/photo?v=${artworkRevision(owner.custom_photo)}`
        : owner.photo_url,
      publicId: owner.public_id,
      hasCustomPhoto: Boolean(owner.custom_photo),
    },
    tracks: trackRows.map((row) => ({ ...toTrack(row, owner.id), liked: likedIds.has(row.id) })),
    availableTracks: availableTrackRows.map((row) => ({
      ...toTrack(row, owner.id, row.accessible_as === "public" ? "public" : "collaborator"),
      liked: likedIds.has(row.id),
    })),
    recentlyPlayed: recentlyPlayedRows.map((row) => ({ ...toTrack(row, owner.id), liked: likedIds.has(row.id) })),
    recommendations,
    playlists,
    playlistFolders: folderRows.map((row) => ({ id: row.id, name: row.name, playlistCount: Number(row.playlist_count) })),
    followedPlaylists: followedRows.map((row) => ({
      playlistId: row.playlist_id,
      shareId: row.share_id,
      name: row.name,
      description: row.description,
      coverSeed: row.cover_seed,
      coverImage: row.cover_image,
      ownerName: row.owner_name,
      trackCount: Number(row.track_count),
      duration: Number(row.duration),
      collaborative: Boolean(row.collaborative),
      followedAt: row.followed_at,
    })),
    notifications: notificationRows.map((row) => ({
      id: row.id,
      playlistId: row.playlist_id,
      playlistName: row.playlist_name,
      message: row.message,
      count: Number(row.event_count),
      read: Boolean(row.read_at),
      createdAt: row.created_at,
    })),
    unreadNotifications: Number(unreadNotificationRow.count),
    notificationPreferences: {
      collaborationActivity: Boolean(preferences.collaboration_activity),
      playlistUpdates: Boolean(preferences.playlist_updates),
    },
    blockedUsers: blockedRows.map((blocked) => ({
      publicId: blocked.public_id,
      displayName: blocked.display_name,
      photoUrl: blocked.custom_photo
        ? `/api/profiles/${blocked.public_id}/photo?v=${artworkRevision(blocked.custom_photo)}`
        : blocked.photo_url,
      blockedAt: blocked.created_at,
    })),
    playbackSummary: getPlaybackSummary(user),
    importSummary: getImportSummary(user),
    demo: trackRows.some((track) => track.telegram_file_id.startsWith("demo:")),
  };
}

function playlistAccess(
  db: Database.Database,
  ownerId: string,
  playlistId: string,
): { id: string; owner_id: string; name: string; access: "owner" | "collaborator"; collaborative: number } | null {
  const row = db.prepare(`
    SELECT p.id, p.owner_id, p.name, p.collaborative,
      CASE WHEN p.owner_id = ? THEN 'owner' ELSE 'collaborator' END AS access
    FROM playlists p
    LEFT JOIN playlist_collaborators pc ON pc.playlist_id = p.id AND pc.user_id = ?
    WHERE p.id = ? AND (p.owner_id = ? OR pc.user_id = ?)
  `).get(ownerId, ownerId, playlistId, ownerId, ownerId) as {
    id: string; owner_id: string; name: string; access: "owner" | "collaborator"; collaborative: number;
  } | undefined;
  return row ?? null;
}

function notifyPlaylistMembers(
  db: Database.Database,
  playlistId: string,
  actorId: string,
  message: string,
  eventType = "collaboration",
): void {
  const recipients = db.prepare(`
    SELECT owner_id AS id FROM playlists WHERE id = ?
    UNION
    SELECT user_id AS id FROM playlist_collaborators WHERE playlist_id = ?
  `).all(playlistId, playlistId) as Array<{ id: string }>;
  const insert = db.prepare(`
    INSERT INTO activity_notifications (
      id, recipient_id, playlist_id, actor_id, event_type, event_count, message, read_at, created_at
    ) VALUES (?, ?, ?, ?, ?, 1, ?, NULL, ?)
  `);
  for (const recipient of recipients) {
    if (recipient.id === actorId) continue;
    const blocked = db.prepare(`
      SELECT 1 FROM user_blocks
      WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
    `).get(recipient.id, actorId, actorId, recipient.id);
    if (blocked) continue;
    const preference = db.prepare(`
      SELECT collaboration_activity, playlist_updates
      FROM notification_preferences WHERE owner_id = ?
    `).get(recipient.id) as { collaboration_activity: number; playlist_updates: number } | undefined;
    const enabled = eventType.startsWith("playlist_")
      ? preference?.playlist_updates !== 0
      : preference?.collaboration_activity !== 0;
    if (!enabled) continue;
    const recent = db.prepare(`
      SELECT id, event_count FROM activity_notifications
      WHERE recipient_id = ? AND playlist_id = ? AND actor_id = ? AND event_type = ?
        AND read_at IS NULL AND created_at >= ?
      ORDER BY created_at DESC LIMIT 1
    `).get(
      recipient.id,
      playlistId,
      actorId,
      eventType,
      new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    ) as { id: string; event_count: number } | undefined;
    if (recent) {
      const count = Number(recent.event_count) + 1;
      db.prepare(`
        UPDATE activity_notifications SET event_count = ?, message = ?, created_at = ? WHERE id = ?
      `).run(count, `${message.slice(0, 150)} · ${count} updates`, now(), recent.id);
    } else {
      insert.run(randomUUID(), recipient.id, playlistId, actorId, eventType, message.slice(0, 180), now());
    }
  }
}

function recordPlaylistTrackActivity(
  db: Database.Database,
  playlistId: string,
  actorId: string,
  tracks: Array<{ id: string; title: string }>,
  action: "added" | "removed",
): void {
  const insert = db.prepare(`
    INSERT INTO playlist_activity (id, playlist_id, actor_id, track_id, track_title, action, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const track of tracks) {
    insert.run(randomUUID(), playlistId, actorId, track.id, track.title.slice(0, 120), action, now());
  }
}

function enforceActionLimit(db: Database.Database, ownerId: string, action: string, targetId: string): void {
  const recentTarget = db.prepare(`
    SELECT 1 FROM user_actions
    WHERE owner_id = ? AND action = ? AND target_id = ? AND created_at >= ?
    LIMIT 1
  `).get(ownerId, action, targetId, new Date(Date.now() - 2_000).toISOString());
  if (recentTarget) throw new Error("Please wait a moment before trying that again.");
  const recentCount = db.prepare(`
    SELECT COUNT(*) AS count FROM user_actions
    WHERE owner_id = ? AND action = ? AND created_at >= ?
  `).get(ownerId, action, new Date(Date.now() - 60 * 60 * 1000).toISOString()) as { count: number };
  const maximum = action === "follow" ? 40 : 15;
  if (Number(recentCount.count) >= maximum) throw new Error("Too many requests. Please try again later.");
  db.prepare("INSERT INTO user_actions (id, owner_id, action, target_id, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(randomUUID(), ownerId, action, targetId, now());
  db.prepare("DELETE FROM user_actions WHERE created_at < ?")
    .run(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
}

export function updateProfile(
  user: TelegramUser,
  input: { displayName: string; bio: string; customPhoto?: string | null },
): void {
  const owner = upsertUser(user);
  const db = database();
  const result = input.customPhoto === undefined
    ? db.prepare("UPDATE users SET display_name = ?, bio = ?, updated_at = ? WHERE id = ?")
      .run(input.displayName, input.bio, now(), owner.id)
    : db.prepare("UPDATE users SET display_name = ?, bio = ?, custom_photo = ?, updated_at = ? WHERE id = ?")
      .run(input.displayName, input.bio, input.customPhoto, now(), owner.id);
  if (!result.changes) throw new Error("Profile was not found.");
}

export function getPublicProfilePhoto(publicId: string): string | null {
  const row = database().prepare("SELECT custom_photo FROM users WHERE public_id = ?")
    .get(publicId) as { custom_photo: string | null } | undefined;
  return row?.custom_photo ?? null;
}

export function getPublicProfileId(user: TelegramUser): string {
  return upsertUser(user).public_id;
}

export function getPublicProfile(publicId: string, viewer?: TelegramUser): SharedProfilePreview | null {
  const db = database();
  const viewerOwner = viewer ? upsertUser(viewer) : null;
  const profile = db.prepare(`
    SELECT id, public_id, COALESCE(NULLIF(display_name, ''), first_name) AS display_name,
      bio, custom_photo
    FROM users WHERE public_id = ?
  `).get(publicId) as {
    id: string; public_id: string; display_name: string; bio: string; custom_photo: string | null;
  } | undefined;
  if (!profile) return null;
  if (viewerOwner) {
    const blocked = db.prepare(`
      SELECT 1 FROM user_blocks
      WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
    `).get(viewerOwner.id, profile.id, profile.id, viewerOwner.id);
    if (blocked) return null;
  }
  const publicPlaylists = db.prepare(`
    SELECT p.id, p.share_id, p.name, p.description, p.cover_seed, p.cover_image,
      p.collaborative, COUNT(pt.track_id) AS track_count,
      COALESCE(SUM(t.duration), 0) AS duration,
      (SELECT COUNT(*) FROM playlist_follows pf WHERE pf.playlist_id = p.id) AS follower_count
    FROM playlists p
    LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
    LEFT JOIN tracks t ON t.id = pt.track_id
    WHERE p.owner_id = ? AND p.visibility = 'public' AND p.kind = 'standard'
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all(profile.id) as Array<{
    id: string; share_id: string | null; name: string; description: string;
    cover_seed: number | null; cover_image: string | null; collaborative: number;
    track_count: number; duration: number; follower_count: number;
  }>;
  const ensureShare = db.prepare("UPDATE playlists SET share_id = COALESCE(share_id, ?), updated_at = ? WHERE id = ?");
  return {
    type: "profile",
    isOwner: Boolean(viewerOwner && viewerOwner.id === profile.id),
    publicId: profile.public_id,
    displayName: profile.display_name,
    bio: profile.bio,
    photoUrl: profile.custom_photo
      ? `/api/profiles/${profile.public_id}/photo?v=${artworkRevision(profile.custom_photo)}`
      : null,
    playlists: publicPlaylists.map((playlist) => {
      const shareId = playlist.share_id ?? randomUUID().replaceAll("-", "");
      if (!playlist.share_id) ensureShare.run(shareId, now(), playlist.id);
      return {
        shareId,
        name: playlist.name,
        description: playlist.description,
        coverSeed: playlist.cover_seed,
        coverImage: playlist.cover_image,
        trackCount: Number(playlist.track_count),
        duration: Number(playlist.duration),
        collaborative: Boolean(playlist.collaborative),
        followerCount: Number(playlist.follower_count),
      };
    }),
  };
}

export function createPlaylistFolder(user: TelegramUser, name: string): string {
  const db = database();
  const owner = upsertUser(user);
  const id = randomUUID();
  db.prepare("INSERT INTO playlist_folders (id, owner_id, name, created_at) VALUES (?, ?, ?, ?)")
    .run(id, owner.id, name, now());
  return id;
}

export function updatePlaylistFolder(user: TelegramUser, folderId: string, name: string): void {
  const owner = upsertUser(user);
  const result = database().prepare("UPDATE playlist_folders SET name = ? WHERE id = ? AND owner_id = ?")
    .run(name, folderId, owner.id);
  if (!result.changes) throw new Error("Folder was not found.");
}

export function deletePlaylistFolder(user: TelegramUser, folderId: string): void {
  const db = database();
  const owner = upsertUser(user);
  db.transaction(() => {
    db.prepare("UPDATE playlists SET folder_id = NULL WHERE folder_id = ? AND owner_id = ?").run(folderId, owner.id);
    const result = db.prepare("DELETE FROM playlist_folders WHERE id = ? AND owner_id = ?").run(folderId, owner.id);
    if (!result.changes) throw new Error("Folder was not found.");
  })();
}

export function setPlaylistFolder(user: TelegramUser, playlistId: string, folderId: string | null): void {
  const db = database();
  const owner = upsertUser(user);
  if (folderId) {
    const folder = db.prepare("SELECT 1 FROM playlist_folders WHERE id = ? AND owner_id = ?").get(folderId, owner.id);
    if (!folder) throw new Error("Folder was not found.");
  }
  const result = db.prepare(`
    UPDATE playlists SET folder_id = ?, updated_at = ?
    WHERE id = ? AND owner_id = ? AND kind = 'standard'
  `).run(folderId, now(), playlistId, owner.id);
  if (!result.changes) throw new Error("Playlist was not found.");
}

export function markNotificationsRead(user: TelegramUser): number {
  const owner = upsertUser(user);
  return database().prepare("UPDATE activity_notifications SET read_at = ? WHERE recipient_id = ? AND read_at IS NULL")
    .run(now(), owner.id).changes;
}

export function updateNotificationPreferences(
  user: TelegramUser,
  input: { collaborationActivity: boolean; playlistUpdates: boolean },
): void {
  const owner = upsertUser(user);
  database().prepare(`
    INSERT INTO notification_preferences (owner_id, collaboration_activity, playlist_updates, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(owner_id) DO UPDATE SET
      collaboration_activity = excluded.collaboration_activity,
      playlist_updates = excluded.playlist_updates,
      updated_at = excluded.updated_at
  `).run(owner.id, input.collaborationActivity ? 1 : 0, input.playlistUpdates ? 1 : 0, now());
}

export function dismissRecommendation(user: TelegramUser, trackId: string): void {
  const owner = upsertUser(user);
  const track = database().prepare("SELECT 1 FROM tracks WHERE id = ? AND owner_id = ?").get(trackId, owner.id);
  if (!track) throw new Error("Track was not found.");
  database().prepare(`
    INSERT OR IGNORE INTO recommendation_dismissals (owner_id, track_id, created_at)
    VALUES (?, ?, ?)
  `).run(owner.id, trackId, now());
}

export function createPlaylist(
  user: TelegramUser,
  input: {
    name: string;
    description?: string;
    trackIds?: string[];
    moveFromPlaylistId?: string;
  },
): string {
  const db = database();
  const owner = upsertUser(user);
  const id = randomUUID();
  const timestamp = now();
  const trackIds = [...new Set(input.trackIds ?? [])];
  return db.transaction(() => {
    if (trackIds.length) {
      const placeholders = trackIds.map(() => "?").join(",");
      const ownedTracks = db.prepare(`
        SELECT id FROM tracks WHERE owner_id = ? AND id IN (${placeholders})
      `).all(owner.id, ...trackIds) as Array<{ id: string }>;
      if (ownedTracks.length !== trackIds.length) throw new Error("One or more tracks were not found.");
      if (input.moveFromPlaylistId) {
        const source = db.prepare(`
          SELECT 1 FROM playlists
          WHERE id = ? AND owner_id = ? AND kind = 'standard'
        `).get(input.moveFromPlaylistId, owner.id);
        if (!source) throw new Error("Source playlist was not found.");
        const sourceTracks = db.prepare(`
          SELECT track_id FROM playlist_tracks
          WHERE playlist_id = ? AND track_id IN (${placeholders})
        `).all(input.moveFromPlaylistId, ...trackIds) as Array<{ track_id: string }>;
        if (sourceTracks.length !== trackIds.length) {
          throw new Error("One or more tracks were not found in the source playlist.");
        }
      }
    }

    db.prepare(`
      INSERT INTO playlists (id, owner_id, name, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, owner.id, input.name, input.description ?? "", timestamp, timestamp);

    if (trackIds.length) {
      const insert = db.prepare(`
        INSERT INTO playlist_tracks (playlist_id, track_id, position, added_at)
        VALUES (?, ?, ?, ?)
      `);
      trackIds.forEach((trackId, position) => insert.run(id, trackId, position, timestamp));
      if (input.moveFromPlaylistId) {
        const placeholders = trackIds.map(() => "?").join(",");
        db.prepare(`
          DELETE FROM playlist_tracks
          WHERE playlist_id = ? AND track_id IN (${placeholders})
        `).run(input.moveFromPlaylistId, ...trackIds);
        db.prepare("UPDATE playlists SET updated_at = ? WHERE id = ?")
          .run(timestamp, input.moveFromPlaylistId);
      }
    }
    return id;
  })();
}

export function updatePlaylistDetails(
  user: TelegramUser,
  playlistId: string,
  input: { name: string; description: string; coverSeed: number | null; coverImage: string | null },
): void {
  const db = database();
  const owner = upsertUser(user);
  const result = db.prepare(`
    UPDATE playlists
    SET name = ?, description = ?, cover_seed = ?, cover_image = ?, updated_at = ?
    WHERE id = ? AND owner_id = ? AND kind = 'standard'
  `).run(input.name, input.description, input.coverSeed, input.coverImage, now(), playlistId, owner.id);
  if (!result.changes) throw new Error("Playlist was not found.");
  notifyPlaylistMembers(db, playlistId, owner.id, `${owner.display_name || owner.first_name} updated the playlist details.`, "playlist_details");
}

export function updateTrackDetails(
  user: TelegramUser,
  trackId: string,
  input: { title: string; artist: string; customArtwork?: string | null },
): void {
  const owner = upsertUser(user);
  const result = input.customArtwork === undefined
    ? database().prepare(`
      UPDATE tracks SET title = ?, artist = ? WHERE id = ? AND owner_id = ?
    `).run(input.title, input.artist, trackId, owner.id)
    : database().prepare(`
      UPDATE tracks SET title = ?, artist = ?, custom_artwork = ? WHERE id = ? AND owner_id = ?
    `).run(input.title, input.artist, input.customArtwork, trackId, owner.id);
  if (!result.changes) throw new Error("Track was not found.");
}

export type PlaybackEventInput = {
  trackId: string | null;
  sessionId: string;
  event: "play_request" | "playback_started" | "buffer_start" | "buffer_end" | "stream_error" | "retry_started" | "retry_recovered" | "skip";
  startupMs?: number | null;
  positionSeconds?: number | null;
  detail?: string | null;
};

export function recordPlaybackEvents(user: TelegramUser, events: PlaybackEventInput[]): number {
  const db = database();
  const owner = upsertUser(user);
  const ownedTrack = db.prepare("SELECT 1 FROM tracks WHERE id = ? AND owner_id = ?");
  const insert = db.prepare(`
    INSERT INTO playback_events (
      id, owner_id, track_id, session_id, event, startup_ms,
      position_seconds, detail, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return db.transaction(() => {
    let inserted = 0;
    for (const event of events) {
      const trackId = event.trackId && ownedTrack.get(event.trackId, owner.id) ? event.trackId : null;
      insert.run(
        randomUUID(), owner.id, trackId, event.sessionId, event.event,
        event.startupMs ?? null, event.positionSeconds ?? null,
        event.detail?.slice(0, 80) ?? null, now(),
      );
      inserted += 1;
    }
    db.prepare("DELETE FROM playback_events WHERE owner_id = ? AND created_at < datetime('now', '-30 days')")
      .run(owner.id);
    return inserted;
  })();
}

export function recordImportEvent(
  user: TelegramUser,
  status: "imported" | "duplicate" | "failed",
  reason?: string,
): void {
  const db = database();
  const owner = upsertUser(user);
  db.prepare(`
    INSERT INTO import_events (id, owner_id, status, reason, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(randomUUID(), owner.id, status, reason?.slice(0, 80) ?? null, now());
  db.prepare("DELETE FROM import_events WHERE owner_id = ? AND created_at < datetime('now', '-30 days')")
    .run(owner.id);
}

export function getImportSummary(user: TelegramUser): LibraryPayload["importSummary"] {
  const owner = upsertUser(user);
  const row = database().prepare(`
    SELECT
      SUM(CASE WHEN status = 'imported' THEN 1 ELSE 0 END) AS imported,
      SUM(CASE WHEN status = 'duplicate' THEN 1 ELSE 0 END) AS duplicates,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
    FROM import_events
    WHERE owner_id = ? AND created_at >= datetime('now', '-7 days')
  `).get(owner.id) as { imported: number | null; duplicates: number | null; failed: number | null };
  return {
    imported: Number(row.imported ?? 0),
    duplicates: Number(row.duplicates ?? 0),
    failed: Number(row.failed ?? 0),
  };
}

export function getPlaybackSummary(user: TelegramUser): LibraryPayload["playbackSummary"] {
  const owner = upsertUser(user);
  const row = database().prepare(`
    SELECT
      SUM(CASE WHEN event = 'playback_started' THEN 1 ELSE 0 END) AS starts,
      SUM(CASE WHEN event = 'stream_error' THEN 1 ELSE 0 END) AS errors,
      SUM(CASE WHEN event = 'buffer_start' THEN 1 ELSE 0 END) AS stalls,
      SUM(CASE WHEN event = 'retry_recovered' THEN 1 ELSE 0 END) AS recovered_retries,
      AVG(CASE WHEN event = 'playback_started' AND startup_ms IS NOT NULL THEN startup_ms END) AS average_startup_ms
    FROM playback_events
    WHERE owner_id = ? AND created_at >= datetime('now', '-7 days')
  `).get(owner.id) as {
    starts: number | null;
    errors: number | null;
    stalls: number | null;
    recovered_retries: number | null;
    average_startup_ms: number | null;
  };
  return {
    starts: Number(row.starts ?? 0),
    errors: Number(row.errors ?? 0),
    stalls: Number(row.stalls ?? 0),
    recoveredRetries: Number(row.recovered_retries ?? 0),
    averageStartupMs: row.average_startup_ms === null ? null : Math.round(row.average_startup_ms),
  };
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
  const access = playlistAccess(db, owner.id, playlistId);
  if (!access) throw new Error("Playlist was not found.");
  if (access.access === "collaborator" && !access.collaborative) throw new Error("Collaboration is paused for this playlist.");
  const placeholders = uniqueTrackIds.map(() => "?").join(",");
  const ownedTracks = db.prepare(`
    SELECT id, title, telegram_file_unique_id FROM tracks WHERE owner_id = ? AND id IN (${placeholders})
  `).all(owner.id, ...uniqueTrackIds) as Array<{ id: string; title: string; telegram_file_unique_id: string }>;
  if (ownedTracks.length !== uniqueTrackIds.length) throw new Error("One or more tracks were not found.");
  const uniqueIdByTrack = new Map(ownedTracks.map((track) => [track.id, track.telegram_file_unique_id]));
  const playlistFileIds = new Set((db.prepare(`
    SELECT t.telegram_file_unique_id FROM playlist_tracks pt
    JOIN tracks t ON t.id = pt.track_id
    WHERE pt.playlist_id = ?
  `).all(playlistId) as Array<{ telegram_file_unique_id: string }>).map((track) => track.telegram_file_unique_id));
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
    const addedTracks: Array<{ id: string; title: string }> = [];
    for (const trackId of uniqueTrackIds) {
      const fileUniqueId = uniqueIdByTrack.get(trackId);
      if (!fileUniqueId || playlistFileIds.has(fileUniqueId)) continue;
      const result = insert.run(playlistId, trackId, nextPosition, now());
      if (result.changes) {
        playlistFileIds.add(fileUniqueId);
        nextPosition += 1;
        added += 1;
        const addedTrack = ownedTracks.find((track) => track.id === trackId);
        if (addedTrack) addedTracks.push(addedTrack);
      }
    }
    if (added) {
      recordPlaylistTrackActivity(db, playlistId, owner.id, addedTracks, "added");
      notifyPlaylistMembers(
        db,
        playlistId,
        owner.id,
        `${owner.display_name || owner.first_name} added ${added} ${added === 1 ? "song" : "songs"}.`,
        "tracks_added",
      );
      db.prepare("UPDATE playlists SET updated_at = ? WHERE id = ?").run(now(), playlistId);
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
  const track = db.prepare(`
    SELECT 1 FROM tracks t WHERE t.id = ? AND (
      t.owner_id = ? OR EXISTS(
        SELECT 1 FROM playlist_tracks pt
        JOIN playlists p ON p.id = pt.playlist_id
        LEFT JOIN playlist_collaborators pc ON pc.playlist_id = pt.playlist_id AND pc.user_id = ?
        WHERE pt.track_id = t.id AND (pc.user_id IS NOT NULL OR p.visibility = 'public')
      )
    )
  `).get(trackId, owner.id, owner.id);
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
  const db = database();
  const owner = upsertUser(user);
  const result = db.prepare(`
    UPDATE playlists SET visibility = ?, share_id = CASE WHEN ? = 'public' THEN COALESCE(share_id, ?) ELSE share_id END, updated_at = ?
    WHERE id = ? AND owner_id = ? AND kind = 'standard'
  `).run(visibility, visibility, createShareId(), now(), playlistId, owner.id);
  if (!result.changes) throw new Error("Playlist was not found.");
  notifyPlaylistMembers(db, playlistId, owner.id, `${owner.display_name || owner.first_name} made the playlist ${visibility}.`, "playlist_visibility");
}

export function setPlaylistCollaborative(user: TelegramUser, playlistId: string, collaborative: boolean): void {
  const db = database();
  const owner = upsertUser(user);
  const playlist = db.prepare("SELECT 1 FROM playlists WHERE id = ? AND owner_id = ? AND kind = 'standard'")
    .get(playlistId, owner.id);
  if (!playlist) throw new Error("Playlist was not found.");
  db.prepare("UPDATE playlists SET collaborative = ?, share_id = COALESCE(share_id, ?), updated_at = ? WHERE id = ?")
    .run(collaborative ? 1 : 0, createShareId(), now(), playlistId);
  notifyPlaylistMembers(
    db,
    playlistId,
    owner.id,
    `${owner.display_name || owner.first_name} ${collaborative ? "enabled" : "paused"} collaboration.`,
    "playlist_collaboration",
  );
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
      (
        SELECT own.id FROM tracks own
        WHERE own.owner_id = ? AND own.telegram_file_unique_id = t.telegram_file_unique_id
        LIMIT 1
      ) AS library_track_id
    FROM tracks t
    JOIN users u ON u.id = t.owner_id
    WHERE t.share_id = ?
      AND NOT EXISTS(
        SELECT 1 FROM user_blocks ub
        WHERE (ub.blocker_id = ? AND ub.blocked_id = t.owner_id)
           OR (ub.blocker_id = t.owner_id AND ub.blocked_id = ?)
      )
  `).get(recipient.id, shareId, recipient.id, recipient.id) as {
    title: string;
    artist: string;
    duration: number;
    telegram_file_unique_id: string;
    owner_name: string;
    library_track_id: string | null;
  } | undefined;
  return row ? {
    type: "song",
    shareId,
    title: row.title,
    artist: row.artist,
    duration: row.duration,
    artworkSeed: artworkSeed(row.telegram_file_unique_id),
    ownerName: row.owner_name,
    alreadyAdded: Boolean(row.library_track_id),
    libraryTrackId: row.library_track_id,
  } : null;
}

export function importSharedSong(
  user: TelegramUser,
  shareId: string,
): { track: Track; created: boolean; possibleDuplicate: Track | null } {
  const db = database();
  const owner = upsertUser(user);
  const row = db.prepare(`
    SELECT t.* FROM tracks t WHERE t.share_id = ? AND NOT EXISTS(
      SELECT 1 FROM user_blocks ub
      WHERE (ub.blocker_id = ? AND ub.blocked_id = t.owner_id)
         OR (ub.blocker_id = t.owner_id AND ub.blocked_id = ?)
    )
  `).get(shareId, owner.id, owner.id) as TrackRow | undefined;
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
    customArtwork: row.custom_artwork ?? undefined,
    preserveExistingMetadata: true,
  });
}

export function getSharedPlaylistPreview(user: TelegramUser, shareId: string): SharedPlaylistPreview | null {
  const db = database();
  const recipient = upsertUser(user);
  const playlist = db.prepare(`
    SELECT p.id, p.owner_id, p.name, p.description, p.cover_seed, p.cover_image, p.collaborative,
      u.public_id AS owner_public_id,
      COALESCE(NULLIF(u.display_name, ''), u.first_name) AS owner_name,
      EXISTS(
        SELECT 1 FROM playlists own
        WHERE own.owner_id = ? AND (own.source_share_id = p.share_id OR own.id = p.id)
      ) AS already_added,
      EXISTS(SELECT 1 FROM playlist_follows pf WHERE pf.playlist_id = p.id AND pf.follower_id = ?) AS following,
      EXISTS(SELECT 1 FROM playlist_collaborators pc WHERE pc.playlist_id = p.id AND pc.user_id = ?) AS is_collaborator,
      (SELECT COUNT(*) FROM playlist_follows pf WHERE pf.playlist_id = p.id) AS follower_count,
      (SELECT COUNT(*) FROM playlist_collaborators pc WHERE pc.playlist_id = p.id) AS collaborator_count
    FROM playlists p
    JOIN users u ON u.id = p.owner_id
    WHERE p.share_id = ? AND p.visibility = 'public' AND p.kind = 'standard'
      AND NOT EXISTS(
        SELECT 1 FROM user_blocks ub
        WHERE (ub.blocker_id = ? AND ub.blocked_id = p.owner_id)
           OR (ub.blocker_id = p.owner_id AND ub.blocked_id = ?)
      )
  `).get(recipient.id, recipient.id, recipient.id, shareId, recipient.id, recipient.id) as {
    id: string;
    owner_id: string;
    name: string;
    description: string;
    cover_seed: number | null;
    cover_image: string | null;
    owner_name: string;
    owner_public_id: string;
    already_added: number;
    following: number;
    collaborative: number;
    is_collaborator: number;
    follower_count: number;
    collaborator_count: number;
  } | undefined;
  if (!playlist) return null;
  const tracks = tracksForPlaylist(playlist.id, new Set(), recipient.id, "public");
  return {
    type: "playlist",
    shareId,
    name: playlist.name,
    description: playlist.description,
    coverSeed: playlist.cover_seed,
    coverImage: playlist.cover_image,
    ownerName: playlist.owner_name,
    ownerPublicId: playlist.owner_public_id,
    trackCount: tracks.length,
    duration: tracks.reduce((total, track) => total + track.duration, 0),
    alreadyAdded: Boolean(playlist.already_added),
    following: Boolean(playlist.following),
    collaborative: Boolean(playlist.collaborative),
    isCollaborator: Boolean(playlist.is_collaborator),
    isOwner: playlist.owner_id === recipient.id,
    followerCount: Number(playlist.follower_count),
    collaboratorCount: Number(playlist.collaborator_count),
    tracks,
  };
}

export function saveAccessibleTrackToLibrary(
  user: TelegramUser,
  trackId: string,
): { track: Track; created: boolean; possibleDuplicate: Track | null } {
  const db = database();
  const owner = upsertUser(user);
  const row = db.prepare(`
    SELECT t.* FROM tracks t
    WHERE t.id = ? AND (
      t.owner_id = ? OR EXISTS(
        SELECT 1 FROM playlist_tracks pt
        JOIN playlist_collaborators pc ON pc.playlist_id = pt.playlist_id
        WHERE pt.track_id = t.id AND pc.user_id = ?
      )
    )
  `).get(trackId, owner.id, owner.id) as TrackRow | undefined;
  if (!row) throw new Error("Track was not found.");
  if (row.owner_id === owner.id) return { track: toTrack(row, owner.id), created: false, possibleDuplicate: null };
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
    customArtwork: row.custom_artwork ?? undefined,
    preserveExistingMetadata: true,
  });
}

export function setPlaylistFollow(user: TelegramUser, shareId: string, following: boolean): boolean {
  const db = database();
  const owner = upsertUser(user);
  const playlist = db.prepare(`
    SELECT id, owner_id FROM playlists
    WHERE share_id = ? AND visibility = 'public' AND kind = 'standard'
  `).get(shareId) as { id: string; owner_id: string } | undefined;
  if (!playlist) throw new Error("Shared playlist was not found.");
  if (playlist.owner_id === owner.id) return false;
  if (following) {
    const blocked = db.prepare(`
      SELECT 1 FROM user_blocks
      WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
    `).get(owner.id, playlist.owner_id, playlist.owner_id, owner.id);
    if (blocked) throw new Error("This playlist is unavailable.");
    const existing = db.prepare("SELECT 1 FROM playlist_follows WHERE follower_id = ? AND playlist_id = ?")
      .get(owner.id, playlist.id);
    if (existing) return false;
    enforceActionLimit(db, owner.id, "follow", playlist.id);
    return Boolean(db.prepare(`
      INSERT OR IGNORE INTO playlist_follows (follower_id, playlist_id, created_at)
      VALUES (?, ?, ?)
    `).run(owner.id, playlist.id, now()).changes);
  }
  return Boolean(db.prepare("DELETE FROM playlist_follows WHERE follower_id = ? AND playlist_id = ?")
    .run(owner.id, playlist.id).changes);
}

export function joinCollaborativePlaylist(user: TelegramUser, shareId: string): { changed: boolean; playlistId: string } {
  const db = database();
  const owner = upsertUser(user);
  const playlist = db.prepare(`
    SELECT id, owner_id FROM playlists
    WHERE share_id = ? AND visibility = 'public' AND collaborative = 1 AND kind = 'standard'
  `).get(shareId) as { id: string; owner_id: string } | undefined;
  if (!playlist) throw new Error("This playlist is not accepting collaborators.");
  if (playlist.owner_id === owner.id) return { changed: false, playlistId: playlist.id };
  const blocked = db.prepare(`
    SELECT 1 FROM user_blocks
    WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
  `).get(owner.id, playlist.owner_id, playlist.owner_id, owner.id);
  if (blocked) throw new Error("This playlist is unavailable.");
  const existing = db.prepare("SELECT 1 FROM playlist_collaborators WHERE user_id = ? AND playlist_id = ?")
    .get(owner.id, playlist.id);
  if (!existing) enforceActionLimit(db, owner.id, "collaborate", playlist.id);
  return db.transaction(() => {
    const result = db.prepare(`
      INSERT OR IGNORE INTO playlist_collaborators (user_id, playlist_id, joined_at)
      VALUES (?, ?, ?)
    `).run(owner.id, playlist.id, now());
    db.prepare(`
      INSERT OR IGNORE INTO playlist_follows (follower_id, playlist_id, created_at)
      VALUES (?, ?, ?)
    `).run(owner.id, playlist.id, now());
    if (result.changes) {
      notifyPlaylistMembers(db, playlist.id, owner.id, `${owner.display_name || owner.first_name} joined as a collaborator.`, "collaborator_joined");
    }
    return { changed: Boolean(result.changes), playlistId: playlist.id };
  })();
}

export function leaveCollaborativePlaylist(user: TelegramUser, playlistId: string): boolean {
  const db = database();
  const owner = upsertUser(user);
  return db.transaction(() => {
    const result = db.prepare("DELETE FROM playlist_collaborators WHERE user_id = ? AND playlist_id = ?")
      .run(owner.id, playlistId);
    if (result.changes) {
      db.prepare(`
        INSERT INTO collaboration_departures (user_id, playlist_id, left_at) VALUES (?, ?, ?)
        ON CONFLICT(user_id, playlist_id) DO UPDATE SET left_at = excluded.left_at
      `).run(owner.id, playlistId, now());
      notifyPlaylistMembers(db, playlistId, owner.id, `${owner.display_name || owner.first_name} left the collaboration.`, "collaborator_left");
    }
    return Boolean(result.changes);
  })();
}

export function restoreCollaborativePlaylist(user: TelegramUser, playlistId: string): boolean {
  const db = database();
  const owner = upsertUser(user);
  const departure = db.prepare(`
    SELECT 1 FROM collaboration_departures cd
    JOIN playlists p ON p.id = cd.playlist_id
    WHERE cd.user_id = ? AND cd.playlist_id = ? AND p.collaborative = 1 AND cd.left_at >= ?
  `).get(owner.id, playlistId, new Date(Date.now() - 10 * 60 * 1000).toISOString());
  if (!departure) throw new Error("This collaboration can no longer be restored.");
  return db.transaction(() => {
    const result = db.prepare(`
      INSERT OR IGNORE INTO playlist_collaborators (user_id, playlist_id, joined_at) VALUES (?, ?, ?)
    `).run(owner.id, playlistId, now());
    db.prepare("DELETE FROM collaboration_departures WHERE user_id = ? AND playlist_id = ?").run(owner.id, playlistId);
    if (result.changes) {
      notifyPlaylistMembers(db, playlistId, owner.id, `${owner.display_name || owner.first_name} rejoined the collaboration.`, "collaborator_joined");
    }
    return Boolean(result.changes);
  })();
}

export function removePlaylistCollaborator(
  user: TelegramUser,
  playlistId: string,
  collaboratorPublicId: string,
): boolean {
  const db = database();
  const owner = upsertUser(user);
  const playlist = db.prepare(`
    SELECT id FROM playlists WHERE id = ? AND owner_id = ? AND kind = 'standard'
  `).get(playlistId, owner.id);
  if (!playlist) throw new Error("Playlist was not found.");
  const collaborator = db.prepare("SELECT id, COALESCE(NULLIF(display_name, ''), first_name) AS name FROM users WHERE public_id = ?")
    .get(collaboratorPublicId) as { id: string; name: string } | undefined;
  if (!collaborator) throw new Error("Collaborator was not found.");
  const membership = db.prepare("SELECT 1 FROM playlist_collaborators WHERE playlist_id = ? AND user_id = ?")
    .get(playlistId, collaborator.id);
  if (!membership) return false;
  return db.transaction(() => {
    notifyPlaylistMembers(db, playlistId, owner.id, `${owner.display_name || owner.first_name} removed ${collaborator.name} from the collaboration.`, "collaborator_removed");
    return Boolean(db.prepare("DELETE FROM playlist_collaborators WHERE playlist_id = ? AND user_id = ?")
      .run(playlistId, collaborator.id).changes);
  })();
}

export function blockPublicUser(user: TelegramUser, publicId: string): boolean {
  const db = database();
  const owner = upsertUser(user);
  const target = db.prepare("SELECT id FROM users WHERE public_id = ?").get(publicId) as { id: string } | undefined;
  if (!target) throw new Error("Listener was not found.");
  if (target.id === owner.id) throw new Error("You cannot block yourself.");
  return db.transaction(() => {
    const result = db.prepare(`
      INSERT OR IGNORE INTO user_blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)
    `).run(owner.id, target.id, now());
    db.prepare(`
      DELETE FROM playlist_follows
      WHERE (follower_id = ? AND playlist_id IN (SELECT id FROM playlists WHERE owner_id = ?))
         OR (follower_id = ? AND playlist_id IN (SELECT id FROM playlists WHERE owner_id = ?))
    `).run(owner.id, target.id, target.id, owner.id);
    db.prepare(`
      DELETE FROM playlist_collaborators
      WHERE (user_id = ? AND playlist_id IN (SELECT id FROM playlists WHERE owner_id = ?))
         OR (user_id = ? AND playlist_id IN (SELECT id FROM playlists WHERE owner_id = ?))
    `).run(owner.id, target.id, target.id, owner.id);
    return Boolean(result.changes);
  })();
}

export function unblockPublicUser(user: TelegramUser, publicId: string): boolean {
  const db = database();
  const owner = upsertUser(user);
  const target = db.prepare("SELECT id FROM users WHERE public_id = ?").get(publicId) as { id: string } | undefined;
  if (!target) throw new Error("Listener was not found.");
  return Boolean(db.prepare("DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?")
    .run(owner.id, target.id).changes);
}

export function reportPublicContent(
  user: TelegramUser,
  input: { targetType: "profile" | "playlist"; targetId: string; reason: string },
): string {
  const db = database();
  const owner = upsertUser(user);
  const target = input.targetType === "profile"
    ? db.prepare("SELECT id FROM users WHERE public_id = ?").get(input.targetId) as { id: string } | undefined
    : db.prepare("SELECT id FROM playlists WHERE share_id = ? AND visibility = 'public'").get(input.targetId) as { id: string } | undefined;
  if (!target) throw new Error("The reported item is unavailable.");
  enforceActionLimit(db, owner.id, "report", `${input.targetType}:${target.id}`);
  const id = randomUUID();
  db.prepare(`
    INSERT INTO content_reports (id, reporter_id, target_type, target_id, reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, owner.id, input.targetType, target.id, input.reason.slice(0, 500), now());
  return id;
}

export function importSharedPlaylist(
  user: TelegramUser,
  shareId: string,
): { playlistId: string; created: boolean; addedTracks: number } {
  const db = database();
  const owner = upsertUser(user);
  const existing = db.prepare("SELECT id FROM playlists WHERE owner_id = ? AND source_share_id = ?")
    .get(owner.id, shareId) as { id: string } | undefined;
  if (existing) return { playlistId: existing.id, created: false, addedTracks: 0 };

  const source = db.prepare(`
    SELECT p.* FROM playlists p
    WHERE p.share_id = ? AND p.visibility = 'public' AND p.kind = 'standard'
  `).get(shareId) as (PlaylistRow & { id: string; owner_id: string; share_id: string }) | undefined;
  if (!source) throw new Error("Shared playlist was not found.");
  if (source.owner_id === owner.id) return { playlistId: source.id, created: false, addedTracks: 0 };
  const sourceTracks = db.prepare(`
    SELECT t.* FROM playlist_tracks pt
    JOIN tracks t ON t.id = pt.track_id
    WHERE pt.playlist_id = ?
    ORDER BY pt.position ASC
  `).all(source.id) as TrackRow[];

  return db.transaction(() => {
    const playlistId = randomUUID();
    const timestamp = now();
    db.prepare(`
      INSERT INTO playlists (
        id, owner_id, name, description, cover_seed, cover_image,
        kind, visibility, source_share_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'standard', 'private', ?, ?, ?)
    `).run(
      playlistId, owner.id, source.name, source.description,
      source.cover_seed, source.cover_image, shareId, timestamp, timestamp,
    );
    const add = db.prepare(`
      INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position, added_at)
      VALUES (?, ?, ?, ?)
    `);
    sourceTracks.forEach((row, position) => {
      const imported = saveTrackWithStatus(user, {
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
        customArtwork: row.custom_artwork ?? undefined,
        preserveExistingMetadata: true,
      });
      add.run(playlistId, imported.track.id, position, timestamp);
    });
    return { playlistId, created: true, addedTracks: sourceTracks.length };
  })();
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
  const access = playlistAccess(db, owner.id, playlistId);
  if (!access) throw new Error("Playlist was not found.");
  if (access.access === "collaborator" && !access.collaborative) throw new Error("Collaboration is paused for this playlist.");
  const placeholders = uniqueTrackIds.map(() => "?").join(",");
  const removingTracks = db.prepare(`
    SELECT t.id, t.title FROM playlist_tracks pt
    JOIN tracks t ON t.id = pt.track_id
    WHERE pt.playlist_id = ? AND pt.track_id IN (${placeholders})
  `).all(playlistId, ...uniqueTrackIds) as Array<{ id: string; title: string }>;
  const result = db.prepare(`
    DELETE FROM playlist_tracks
    WHERE playlist_id = ? AND track_id IN (${placeholders})
  `).run(playlistId, ...uniqueTrackIds);
  if (!result.changes) throw new Error("Playlist track was not found.");
  recordPlaylistTrackActivity(db, playlistId, owner.id, removingTracks, "removed");
  notifyPlaylistMembers(
    db,
    playlistId,
    owner.id,
    `${owner.display_name || owner.first_name} removed ${result.changes} ${result.changes === 1 ? "song" : "songs"}.`,
    "tracks_removed",
  );
  db.prepare("UPDATE playlists SET updated_at = ? WHERE id = ?").run(now(), playlistId);
  return Number(result.changes);
}

export function restoreTracksToPlaylist(
  user: TelegramUser,
  playlistId: string,
  trackIds: string[],
): number {
  const db = database();
  const owner = upsertUser(user);
  const uniqueTrackIds = [...new Set(trackIds)];
  if (!uniqueTrackIds.length) return 0;
  const access = playlistAccess(db, owner.id, playlistId);
  if (!access) throw new Error("Playlist was not found.");
  if (access.access === "collaborator" && !access.collaborative) throw new Error("Collaboration is paused for this playlist.");
  const placeholders = uniqueTrackIds.map(() => "?").join(",");
  const recent = db.prepare(`
    SELECT DISTINCT t.id, t.title, t.telegram_file_unique_id
    FROM playlist_activity pa
    JOIN tracks t ON t.id = pa.track_id
    WHERE pa.playlist_id = ? AND pa.actor_id = ? AND pa.action = 'removed'
      AND pa.track_id IN (${placeholders}) AND pa.created_at >= ?
  `).all(
    playlistId,
    owner.id,
    ...uniqueTrackIds,
    new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  ) as Array<{ id: string; title: string; telegram_file_unique_id: string }>;
  if (recent.length !== uniqueTrackIds.length) throw new Error("One or more songs can no longer be restored.");
  const existingFileIds = new Set((db.prepare(`
    SELECT t.telegram_file_unique_id FROM playlist_tracks pt
    JOIN tracks t ON t.id = pt.track_id WHERE pt.playlist_id = ?
  `).all(playlistId) as Array<{ telegram_file_unique_id: string }>).map((row) => row.telegram_file_unique_id));
  const position = db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS position FROM playlist_tracks WHERE playlist_id = ?")
    .get(playlistId) as { position: number };
  return db.transaction(() => {
    let nextPosition = Number(position.position);
    const restored: Array<{ id: string; title: string }> = [];
    const insert = db.prepare(`
      INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position, added_at) VALUES (?, ?, ?, ?)
    `);
    for (const track of recent) {
      if (existingFileIds.has(track.telegram_file_unique_id)) continue;
      if (insert.run(playlistId, track.id, nextPosition, now()).changes) {
        restored.push(track);
        existingFileIds.add(track.telegram_file_unique_id);
        nextPosition += 1;
      }
    }
    if (restored.length) {
      recordPlaylistTrackActivity(db, playlistId, owner.id, restored, "added");
      notifyPlaylistMembers(db, playlistId, owner.id, `${owner.display_name || owner.first_name} restored ${restored.length} ${restored.length === 1 ? "song" : "songs"}.`, "tracks_added");
      db.prepare("UPDATE playlists SET updated_at = ? WHERE id = ?").run(now(), playlistId);
    }
    return restored.length;
  })();
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
  const affectedCollaborations = db.prepare(`
    SELECT p.id, COUNT(pt.track_id) AS removed_count
    FROM playlist_tracks pt
    JOIN playlists p ON p.id = pt.playlist_id
    WHERE pt.track_id IN (${placeholders})
      AND (
        p.owner_id != ? OR EXISTS(SELECT 1 FROM playlist_collaborators pc WHERE pc.playlist_id = p.id)
      )
    GROUP BY p.id
  `).all(...uniqueTrackIds, owner.id) as Array<{ id: string; removed_count: number }>;
  return db.transaction(() => {
    for (const playlist of affectedCollaborations) {
      const removedTracks = db.prepare(`
        SELECT t.id, t.title FROM playlist_tracks pt
        JOIN tracks t ON t.id = pt.track_id
        WHERE pt.playlist_id = ? AND pt.track_id IN (${placeholders})
      `).all(playlist.id, ...uniqueTrackIds) as Array<{ id: string; title: string }>;
      recordPlaylistTrackActivity(db, playlist.id, owner.id, removedTracks, "removed");
      notifyPlaylistMembers(
        db,
        playlist.id,
        owner.id,
        `${owner.display_name || owner.first_name} removed ${playlist.removed_count} ${playlist.removed_count === 1 ? "song" : "songs"} from their library.`,
        "tracks_removed",
      );
      db.prepare("UPDATE playlists SET updated_at = ? WHERE id = ?").run(now(), playlist.id);
    }
    return Number(db.prepare(`
      DELETE FROM tracks WHERE owner_id = ? AND id IN (${placeholders})
    `).run(owner.id, ...uniqueTrackIds).changes);
  })();
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
  customArtwork: string | null;
  mimeType: string | null;
  fileSize: number | null;
  title: string;
  artist: string;
};

export function getPlaybackFile(telegramId: string, trackId: string): PlaybackFile | null {
  const row = database().prepare(`
    SELECT t.telegram_file_id, t.thumbnail_file_id, t.custom_artwork, t.mime_type, t.file_size,
      t.title, t.artist
    FROM tracks t
    JOIN users viewer ON viewer.telegram_id = ?
    WHERE t.id = ? AND (
      t.owner_id = viewer.id OR EXISTS(
        SELECT 1 FROM playlist_tracks pt
        JOIN playlists p ON p.id = pt.playlist_id
        LEFT JOIN playlist_collaborators pc ON pc.playlist_id = pt.playlist_id AND pc.user_id = viewer.id
        WHERE pt.track_id = t.id AND (pc.user_id IS NOT NULL OR p.visibility = 'public')
      )
    )
    AND NOT EXISTS(
      SELECT 1 FROM user_blocks ub
      WHERE (ub.blocker_id = viewer.id AND ub.blocked_id = t.owner_id)
         OR (ub.blocker_id = t.owner_id AND ub.blocked_id = viewer.id)
    )
  `).get(telegramId, trackId) as {
    telegram_file_id: string;
    thumbnail_file_id: string | null;
    custom_artwork: string | null;
    mime_type: string | null;
    file_size: number | null;
    title: string;
    artist: string;
  } | undefined;
  return row ? {
    telegramFileId: row.telegram_file_id,
    thumbnailFileId: row.thumbnail_file_id,
    customArtwork: row.custom_artwork,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    title: row.title,
    artist: row.artist,
  } : null;
}

export function getAccessibleTracks(user: TelegramUser, trackIds: string[]): Track[] {
  const db = database();
  const owner = upsertUser(user);
  const uniqueIds = [...new Set(trackIds)].slice(0, 250);
  if (!uniqueIds.length) return [];
  const placeholders = uniqueIds.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT DISTINCT t.*, COALESCE(NULLIF(track_owner.display_name, ''), track_owner.first_name) AS owner_name,
      CASE WHEN t.owner_id = ? THEN 'owned'
        WHEN EXISTS(
          SELECT 1 FROM playlist_tracks cpt JOIN playlist_collaborators cpc ON cpc.playlist_id = cpt.playlist_id
          WHERE cpt.track_id = t.id AND cpc.user_id = ?
        ) THEN 'collaborator' ELSE 'public' END AS accessible_as
    FROM tracks t
    JOIN users track_owner ON track_owner.id = t.owner_id
    WHERE t.id IN (${placeholders}) AND (
      t.owner_id = ? OR EXISTS(
        SELECT 1 FROM playlist_tracks apt
        JOIN playlists ap ON ap.id = apt.playlist_id
        LEFT JOIN playlist_collaborators apc ON apc.playlist_id = ap.id AND apc.user_id = ?
        WHERE apt.track_id = t.id AND (ap.visibility = 'public' OR apc.user_id IS NOT NULL)
      )
    ) AND NOT EXISTS(
      SELECT 1 FROM user_blocks ub
      WHERE (ub.blocker_id = ? AND ub.blocked_id = t.owner_id)
         OR (ub.blocker_id = t.owner_id AND ub.blocked_id = ?)
    )
  `).all(owner.id, owner.id, ...uniqueIds, owner.id, owner.id, owner.id, owner.id) as TrackRow[];
  const byId = new Map(rows.map((row) => [row.id, {
    ...toTrack(row, owner.id, row.accessible_as === "public" ? "public" : "collaborator"),
    liked: false,
  }]));
  return uniqueIds.flatMap((id) => byId.get(id) ?? []);
}

export function getOwnedTracks(user: TelegramUser, trackIds: string[]): TelegramTrack[] {
  if (!trackIds.length) return [];
  const owner = upsertUser(user);
  const placeholders = trackIds.map(() => "?").join(",");
  const rows = database().prepare(`
    SELECT id, telegram_file_id, title, artist, duration
    FROM tracks t WHERE t.id IN (${placeholders}) AND (
      t.owner_id = ? OR EXISTS(
        SELECT 1 FROM playlist_tracks pt
        JOIN playlists p ON p.id = pt.playlist_id
        LEFT JOIN playlist_collaborators pc ON pc.playlist_id = pt.playlist_id AND pc.user_id = ?
        WHERE pt.track_id = t.id AND (p.visibility = 'public' OR pc.user_id IS NOT NULL)
      )
    ) AND NOT EXISTS(
      SELECT 1 FROM user_blocks ub
      WHERE (ub.blocker_id = ? AND ub.blocked_id = t.owner_id)
         OR (ub.blocker_id = t.owner_id AND ub.blocked_id = ?)
    )
  `).all(...trackIds, owner.id, owner.id, owner.id, owner.id) as Array<{
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
