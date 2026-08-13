import type { Track } from "@/lib/types";

export type StoredRepeatMode = "off" | "all" | "one";

export type StoredPlayerState = {
  version: 1;
  queueIds: string[];
  currentTrackId: string;
  playbackStackIds: string[];
  currentTime: number;
  shuffleEnabled: boolean;
  repeatMode: StoredRepeatMode;
  savedAt: number;
};

export type RestoredPlayerState = {
  queue: Track[];
  queueIndex: number;
  playbackStack: Track[];
  currentTime: number;
  shuffleEnabled: boolean;
  repeatMode: StoredRepeatMode;
};

const MAX_PERSISTED_QUEUE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function encodePlayerState(input: Omit<StoredPlayerState, "version" | "savedAt">, savedAt = Date.now()): string {
  return JSON.stringify({ version: 1, savedAt, ...input } satisfies StoredPlayerState);
}

export function restorePlayerState(raw: string | null, tracks: Track[], now = Date.now()): RestoredPlayerState | null {
  if (!raw) return null;
  let saved: StoredPlayerState;
  try {
    saved = JSON.parse(raw) as StoredPlayerState;
  } catch {
    return null;
  }
  if (
    saved.version !== 1
    || !Array.isArray(saved.queueIds)
    || !Array.isArray(saved.playbackStackIds)
    || typeof saved.currentTrackId !== "string"
    || !Number.isFinite(saved.savedAt)
    || saved.savedAt > now + 60_000
    || now - saved.savedAt > MAX_PERSISTED_QUEUE_AGE_MS
    || !["off", "all", "one"].includes(saved.repeatMode)
  ) return null;

  const playableById = new Map(tracks.filter((track) => track.playable && track.streamUrl).map((track) => [track.id, track]));
  const uniqueIds = [...new Set(saved.queueIds.filter((id): id is string => typeof id === "string"))];
  const queue = uniqueIds.flatMap((id) => playableById.get(id) ?? []);
  const queueIndex = queue.findIndex((track) => track.id === saved.currentTrackId);
  if (!queue.length || queueIndex < 0) return null;

  const queueIds = new Set(queue.map((track) => track.id));
  const playbackStack = [...new Set(saved.playbackStackIds.filter((id): id is string => typeof id === "string"))]
    .filter((id) => !queueIds.has(id))
    .flatMap((id) => playableById.get(id) ?? [])
    .slice(-50);
  const duration = queue[queueIndex].duration;
  const currentTime = Number.isFinite(saved.currentTime)
    ? Math.min(Math.max(0, saved.currentTime), Math.max(0, duration - 1))
    : 0;

  return {
    queue,
    queueIndex,
    playbackStack,
    currentTime,
    shuffleEnabled: Boolean(saved.shuffleEnabled),
    repeatMode: saved.repeatMode,
  };
}
