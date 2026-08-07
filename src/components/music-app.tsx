"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Globe2,
  Heart,
  House,
  Inbox,
  Library,
  ListMusic,
  ListPlus,
  LoaderCircle,
  Lock,
  MonitorSmartphone,
  MoreHorizontal,
  Moon,
  Music2,
  Pause,
  Play,
  Plus,
  Repeat2,
  Search,
  Send,
  Share2,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  Sun,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LibraryPayload, Playlist, SharedPreview, Track } from "@/lib/types";

type Tab = "home" | "library" | "playlists";
type ThemeMode = "telegram" | "light" | "dark";
type ResolvedTheme = "light" | "dark";
type Toast = { kind: "success" | "error"; message: string } | null;

function initData(): string {
  return typeof window === "undefined" ? "" : window.Telegram?.WebApp.initData ?? "";
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      "x-telegram-init-data": initData(),
      ...options.headers,
    },
  });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? "Something went wrong.");
  return result;
}

function formatDuration(seconds: number): string {
  if (!seconds) return "—";
  const minutes = Math.floor(seconds / 60);
  const remainder = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function formatCollectionDuration(seconds: number): string {
  if (!seconds) return "0 min";
  const minutes = Math.round(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} hr ${minutes % 60} min` : `${minutes} min`;
}

function formatPlaybackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function randomized<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function Cover({
  seed,
  size = "medium",
  label,
  artworkUrl,
}: {
  seed: number;
  size?: "small" | "medium" | "large" | "hero";
  label: string;
  artworkUrl?: string;
}) {
  return (
    <div className={`cover cover-${seed % 8} cover-${size}`} aria-label={`${label} artwork`}>
      {artworkUrl ? (
        <span className="cover-image" style={{ backgroundImage: `url(${artworkUrl})` }} />
      ) : (
        <><div className="cover-orbit" /><Music2 aria-hidden="true" /></>
      )}
    </div>
  );
}

function PlaylistCover({ playlist, large = false }: { playlist: Playlist; large?: boolean }) {
  const tracks = playlist.tracks.slice(0, 4);
  const EmptyIcon = playlist.kind === "liked" ? Heart : Music2;
  const tiles: Array<Track | null> = tracks.length
    ? tracks
    : Array.from({ length: 4 }, () => null);
  return (
    <div className={`playlist-cover ${large ? "playlist-cover-large" : ""}`} aria-label={`${playlist.name} cover`}>
      {tiles.map((track, index) => (
        <div
          className={`playlist-tile cover-${track ? track.artworkSeed % 8 : (index + 2) % 8}`}
          key={track?.id ?? index}
          style={track?.artworkUrl ? { backgroundImage: `url(${track.artworkUrl})` } : undefined}
        >
          {index === 3 && !track ? <EmptyIcon aria-hidden="true" /> : null}
        </div>
      ))}
    </div>
  );
}

function TrackRow({
  track,
  onPlay,
  onMore,
  ordinal,
}: {
  track: Track;
  onPlay: () => void;
  onMore: () => void;
  ordinal?: number;
}) {
  return (
    <div className="track-row">
      <button className="track-main" onClick={onPlay} aria-label={`Play ${track.title}`}>
        {ordinal ? <span className="track-number">{ordinal}</span> : <Cover seed={track.artworkSeed} size="small" label={track.title} artworkUrl={track.artworkUrl} />}
        <span className="track-copy">
          <span className="track-title">{track.title}</span>
          <span className="track-artist">{track.artist}</span>
        </span>
      </button>
      <span className="track-duration">{formatDuration(track.duration)}</span>
      <button className="icon-button track-more" onClick={onMore} aria-label={`More options for ${track.title}`}>
        <MoreHorizontal aria-hidden="true" />
      </button>
    </div>
  );
}

function EmptyState({ icon = "inbox", title, copy }: { icon?: "inbox" | "playlist"; title: string; copy: string }) {
  const Icon = icon === "playlist" ? ListMusic : Inbox;
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon aria-hidden="true" /></span>
      <h3>{title}</h3>
      <p>{copy}</p>
    </div>
  );
}

function Skeleton() {
  return (
    <main className="screen loading-screen">
      <div className="skeleton skeleton-header" />
      <div className="skeleton skeleton-hero" />
      <div className="skeleton skeleton-heading" />
      {Array.from({ length: 5 }).map((_, index) => <div className="skeleton skeleton-row" key={index} />)}
    </main>
  );
}

export function MusicApp() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const historyRecordedTrackRef = useRef<string | null>(null);
  const sharedParamHandledRef = useRef(false);
  const [library, setLibrary] = useState<LibraryPayload | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [addMusicPlaylistId, setAddMusicPlaylistId] = useState<string | null>(null);
  const [deletePlaylistTarget, setDeletePlaylistTarget] = useState<Playlist | null>(null);
  const [trackMenu, setTrackMenu] = useState<Track | null>(null);
  const [sending, setSending] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sharedPreview, setSharedPreview] = useState<SharedPreview | null>(null);
  const [sharedLoading, setSharedLoading] = useState(false);
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [repeatOne, setRepeatOne] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "telegram";
    const saved = window.localStorage.getItem("tune:theme");
    return saved === "light" || saved === "dark" || saved === "telegram" ? saved : "telegram";
  });
  const [hostTheme, setHostTheme] = useState<ResolvedTheme>(() => {
    if (typeof window === "undefined") return "dark";
    return window.Telegram?.WebApp.colorScheme
      ?? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  });
  const effectiveTheme = themeMode === "telegram" ? hostTheme : themeMode;

  const loadLibrary = useCallback(async () => {
    try {
      setError(null);
      setLibrary(await api<LibraryPayload>("/api/library"));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load your library.");
    }
  }, []);

  useEffect(() => {
    let timer = 0;
    let attempts = 0;
    const start = () => {
      const webApp = window.Telegram?.WebApp;
      const localPreview = process.env.NODE_ENV !== "production";
      if (!webApp && !localPreview && attempts < 50) {
        attempts += 1;
        timer = window.setTimeout(start, 100);
        return;
      }
      webApp?.ready();
      webApp?.expand();
      if (webApp?.isVersionAtLeast("6.1")) {
        const light = document.documentElement.dataset.theme === "light";
        webApp.setHeaderColor(light ? "#f8f6ef" : "#11110f");
        webApp.setBackgroundColor(light ? "#f8f6ef" : "#11110f");
      }
      void loadLibrary();
    };
    timer = window.setTimeout(start, 0);
    return () => window.clearTimeout(timer);
  }, [loadLibrary]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    let timer = 0;
    let attempts = 0;
    let webApp = window.Telegram?.WebApp;
    const update = () => setHostTheme(webApp?.colorScheme ?? (media.matches ? "light" : "dark"));
    const connect = () => {
      webApp = window.Telegram?.WebApp;
      if (!webApp && process.env.NODE_ENV === "production" && attempts < 50) {
        attempts += 1;
        timer = window.setTimeout(connect, 100);
        return;
      }
      update();
      webApp?.onEvent?.("themeChanged", update);
    };
    media.addEventListener("change", update);
    connect();
    return () => {
      window.clearTimeout(timer);
      media.removeEventListener("change", update);
      webApp?.offEvent?.("themeChanged", update);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = effectiveTheme;
    window.localStorage.setItem("tune:theme", themeMode);
    const color = effectiveTheme === "light" ? "#f8f6ef" : "#11110f";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
    const webApp = window.Telegram?.WebApp;
    if (webApp?.isVersionAtLeast("6.1")) {
      webApp.setHeaderColor(color);
      webApp.setBackgroundColor(color);
    }
  }, [effectiveTheme, themeMode]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const savedVolume = Number(window.localStorage.getItem("tune:volume"));
    const savedMuted = window.localStorage.getItem("tune:muted") === "true";
    const nextVolume = Number.isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 1
      ? savedVolume
      : 1;
    audio.volume = nextVolume;
    audio.muted = savedMuted;
    setVolume(nextVolume);
    setMuted(savedMuted);
  }, []);

  useEffect(() => {
    if (!playerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [playerOpen]);

  useEffect(() => {
    if (!library || sharedParamHandledRef.current) return;
    const token = window.Telegram?.WebApp.initDataUnsafe?.start_param
      ?? new URLSearchParams(window.location.search).get("startapp")
      ?? new URLSearchParams(window.location.search).get("tgWebAppStartParam");
    if (!token || !/^[sp]_[a-f\d]{32}$/.test(token)) return;
    sharedParamHandledRef.current = true;
    const timer = window.setTimeout(() => {
      setSharedLoading(true);
      void api<SharedPreview>(`/api/shared/${token}`)
        .then(setSharedPreview)
        .catch((shareError) => {
          setToast({ kind: "error", message: shareError instanceof Error ? shareError.message : "Could not open shared item." });
        })
        .finally(() => setSharedLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [library]);

  const selectedPlaylist = library?.playlists.find((playlist) => playlist.id === selectedPlaylistId) ?? null;
  const currentTrack = queue[queueIndex] ?? null;
  const filteredTracks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return library?.tracks ?? [];
    return (library?.tracks ?? []).filter((track) =>
      `${track.title} ${track.artist}`.toLocaleLowerCase().includes(query),
    );
  }, [library?.tracks, search]);

  function haptic(kind: "selection" | "success" | "error" = "selection") {
    const webApp = window.Telegram?.WebApp;
    if (!webApp?.isVersionAtLeast("6.1")) return;
    const feedback = webApp.HapticFeedback;
    if (kind === "selection") feedback?.selectionChanged();
    else feedback?.notificationOccurred(kind);
  }

  const activateTrack = useCallback((track: Track, autoplay = true) => {
    const audio = audioRef.current;
    if (!audio || !track.streamUrl) return;
    if (audio.getAttribute("src") !== track.streamUrl) {
      audio.src = track.streamUrl;
      audio.load();
    }
    setCurrentTime(0);
    setMediaDuration(track.duration);
    historyRecordedTrackRef.current = null;
    if (autoplay) {
      void audio.play().catch(() => {
        setIsPlaying(false);
        setToast({ kind: "error", message: "Tap play once more to start audio." });
      });
    }
  }, []);

  useEffect(() => {
    if (!currentTrack || !isPlaying || historyRecordedTrackRef.current === currentTrack.id) return;
    const duration = mediaDuration || currentTrack.duration;
    const threshold = Math.min(15, Math.max(3, duration * 0.5));
    if (currentTime < threshold) return;
    historyRecordedTrackRef.current = currentTrack.id;
    void api(`/api/tracks/${currentTrack.id}/played`, { method: "POST" })
      .then(() => loadLibrary())
      .catch(() => { historyRecordedTrackRef.current = null; });
  }, [currentTime, currentTrack, isPlaying, loadLibrary, mediaDuration]);

  const playAt = useCallback((tracks: Track[], index: number) => {
    if (!tracks.length) return;
    const safeIndex = ((index % tracks.length) + tracks.length) % tracks.length;
    setQueue(tracks);
    setQueueIndex(safeIndex);
    activateTrack(tracks[safeIndex]);
  }, [activateTrack]);

  const startInAppQueue = useCallback((tracks: Track[], shuffle = false, startIndex = 0) => {
    if (!tracks.length) return;
    const selected = tracks[startIndex] ?? tracks[0];
    if (!selected.playable || !selected.streamUrl) {
      setToast({
        kind: "error",
        message: "Demo tracks are visual placeholders. Send music to your bot to play it.",
      });
      return;
    }
    const playable = tracks.filter((track) => track.playable && track.streamUrl);
    if (!playable.length) return;
    const nextQueue = shuffle
      ? randomized(playable)
      : playable;
    const nextIndex = shuffle
      ? 0
      : Math.max(0, nextQueue.findIndex((track) => track.id === selected.id));
    setShuffleEnabled(shuffle);
    haptic();
    playAt(nextQueue, nextIndex);
  }, [playAt]);

  const advanceTrack = useCallback((direction: 1 | -1) => {
    if (!queue.length) return;
    const nextIndex = (queueIndex + direction + queue.length) % queue.length;
    setQueueIndex(nextIndex);
    activateTrack(queue[nextIndex]);
    haptic();
  }, [activateTrack, queue, queueIndex]);

  const previousTrack = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      setCurrentTime(0);
      return;
    }
    advanceTrack(-1);
  }, [advanceTrack]);

  const togglePlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    if (audio.paused) {
      void audio.play().catch(() => setToast({ kind: "error", message: "Audio could not start." }));
    } else {
      audio.pause();
    }
    haptic();
  }, [currentTrack]);

  const seekTo = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(seconds)) return;
    audio.currentTime = seconds;
    setCurrentTime(seconds);
  }, []);

  const changeVolume = useCallback((nextVolume: number) => {
    const normalized = Math.min(1, Math.max(0, nextVolume));
    const nextMuted = normalized === 0;
    const audio = audioRef.current;
    if (audio) {
      audio.volume = normalized;
      audio.muted = nextMuted;
    }
    setVolume(normalized);
    setMuted(nextMuted);
    window.localStorage.setItem("tune:volume", String(normalized));
    window.localStorage.setItem("tune:muted", String(nextMuted));
  }, []);

  const toggleMute = useCallback(() => {
    const nextMuted = !muted;
    const nextVolume = !nextMuted && volume === 0 ? 0.75 : volume;
    const audio = audioRef.current;
    if (audio) {
      audio.volume = nextVolume;
      audio.muted = nextMuted;
    }
    if (nextVolume !== volume) {
      setVolume(nextVolume);
      window.localStorage.setItem("tune:volume", String(nextVolume));
    }
    setMuted(nextMuted);
    window.localStorage.setItem("tune:muted", String(nextMuted));
    haptic();
  }, [muted, volume]);

  const toggleShuffle = useCallback(() => {
    if (!currentTrack || !queue.length) return;
    if (!shuffleEnabled) {
      const rest = randomized(queue.filter((track) => track.id !== currentTrack.id));
      setQueue([currentTrack, ...rest]);
      setQueueIndex(0);
      setShuffleEnabled(true);
    } else {
      setShuffleEnabled(false);
    }
    haptic();
  }, [currentTrack, queue, shuffleEnabled]);

  function playTrackNext(track: Track) {
    if (!track.playable || !track.streamUrl) {
      setToast({ kind: "error", message: "This track is not available for playback." });
      return;
    }
    if (!currentTrack) {
      startInAppQueue([track]);
      return;
    }
    if (track.id === currentTrack.id) {
      setToast({ kind: "success", message: "This song is already playing" });
      return;
    }
    const nextQueue = queue.filter((item, index) => index === queueIndex || item.id !== track.id);
    const currentIndex = nextQueue.findIndex((item) => item.id === currentTrack.id);
    nextQueue.splice(currentIndex + 1, 0, track);
    setQueue(nextQueue);
    setQueueIndex(currentIndex);
    setTrackMenu(null);
    haptic();
    setToast({ kind: "success", message: "Playing next" });
  }

  function moveQueueTrack(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= queue.length) return;
    const activeId = currentTrack?.id;
    const nextQueue = [...queue];
    [nextQueue[index], nextQueue[target]] = [nextQueue[target], nextQueue[index]];
    setQueue(nextQueue);
    if (activeId) setQueueIndex(nextQueue.findIndex((track) => track.id === activeId));
    haptic();
  }

  function removeQueueTrack(index: number) {
    if (index < 0 || index >= queue.length) return;
    if (queue.length === 1) {
      clearQueue();
      return;
    }
    const removingCurrent = index === queueIndex;
    const nextQueue = queue.filter((_, itemIndex) => itemIndex !== index);
    if (removingCurrent) {
      const nextIndex = Math.min(index, nextQueue.length - 1);
      setQueue(nextQueue);
      setQueueIndex(nextIndex);
      activateTrack(nextQueue[nextIndex]);
    } else {
      setQueue(nextQueue);
      if (index < queueIndex) setQueueIndex((current) => current - 1);
    }
    haptic();
  }

  function clearQueue() {
    const audio = audioRef.current;
    audio?.pause();
    audio?.removeAttribute("src");
    audio?.load();
    if ("mediaSession" in navigator) navigator.mediaSession.metadata = null;
    setQueue([]);
    setQueueIndex(0);
    setCurrentTime(0);
    setMediaDuration(0);
    setIsPlaying(false);
    setQueueOpen(false);
    setPlayerOpen(false);
    haptic();
    setToast({ kind: "success", message: "Queue cleared" });
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        setTab("library");
        setSelectedPlaylistId(null);
        window.setTimeout(() => searchInputRef.current?.focus(), 0);
        return;
      }

      const target = event.target instanceof HTMLElement ? event.target : null;
      const input = target instanceof HTMLInputElement ? target : null;
      const typing = target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || target?.isContentEditable
        || (input && input.type !== "range");
      if (typing || target?.closest("button, a, [role='button']")) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if ((event.code === "Space" || event.key === " ") && currentTrack) {
        event.preventDefault();
        togglePlayback();
        return;
      }
      if (event.key === "ArrowLeft" && currentTrack) {
        event.preventDefault();
        seekTo(Math.max(0, (audioRef.current?.currentTime ?? 0) - 10));
      } else if (event.key === "ArrowRight" && currentTrack) {
        event.preventDefault();
        const end = mediaDuration || currentTrack.duration || Number.POSITIVE_INFINITY;
        seekTo(Math.min(end, (audioRef.current?.currentTime ?? 0) + 10));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentTrack, mediaDuration, seekTo, togglePlayback]);

  useEffect(() => {
    if (!currentTrack || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: "tune · Telegram library",
      artwork: currentTrack.artworkUrl
        ? [{ src: new URL(currentTrack.artworkUrl, window.location.origin).href, sizes: "320x320", type: "image/jpeg" }]
        : [],
    });
    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ["play", () => void audioRef.current?.play()],
      ["pause", () => audioRef.current?.pause()],
      ["nexttrack", () => advanceTrack(1)],
      ["previoustrack", previousTrack],
      ["seekto", (details) => details.seekTime !== undefined && seekTo(details.seekTime)],
      ["seekforward", (details) => seekTo((audioRef.current?.currentTime ?? 0) + (details.seekOffset ?? 10))],
      ["seekbackward", (details) => seekTo(Math.max(0, (audioRef.current?.currentTime ?? 0) - (details.seekOffset ?? 10)))],
    ];
    for (const [action, handler] of handlers) {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* unsupported action */ }
    }
    return () => {
      for (const [action] of handlers) {
        try { navigator.mediaSession.setActionHandler(action, null); } catch { /* unsupported action */ }
      }
    };
  }, [advanceTrack, currentTrack, previousTrack, seekTo]);

  async function sendQueue(trackIds: string[], shuffle = false) {
    if (!trackIds.length || sending) return;
    setSending(true);
    haptic();
    try {
      const result = await api<{ count: number; chatUrl: string | null }>("/api/play", {
        method: "POST",
        body: JSON.stringify({ trackIds, shuffle }),
      });
      haptic("success");
      setToast({
        kind: "success",
        message: `${result.count === 1 ? "Track" : `${result.count} tracks`} sent to Telegram`,
      });
      if (result.chatUrl) {
        window.setTimeout(() => {
          if (window.Telegram?.WebApp) window.Telegram.WebApp.openTelegramLink(result.chatUrl!);
          else window.location.assign(result.chatUrl!);
        }, 500);
      }
    } catch (playError) {
      haptic("error");
      setToast({ kind: "error", message: playError instanceof Error ? playError.message : "Could not send queue." });
    } finally {
      setSending(false);
    }
  }

  async function openShareFlow(url: string, text: string) {
    const webApp = window.Telegram?.WebApp;
    if (webApp) {
      webApp.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
      return;
    }
    if (navigator.share) {
      await navigator.share({ title: "tune", text, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    setToast({ kind: "success", message: "Share link copied" });
  }

  async function shareTrack(track: Track) {
    setMutating(true);
    try {
      const result = await api<{ url: string }>(`/api/tracks/${track.id}/share`, { method: "POST" });
      setTrackMenu(null);
      haptic("success");
      await openShareFlow(result.url, `Listen to “${track.title}” by ${track.artist} on tune.`);
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      setToast({ kind: "error", message: shareError instanceof Error ? shareError.message : "Could not share song." });
    } finally {
      setMutating(false);
    }
  }

  async function updatePlaylistVisibility(playlist: Playlist) {
    const visibility = playlist.visibility === "public" ? "private" : "public";
    setMutating(true);
    try {
      await api(`/api/playlists/${playlist.id}`, {
        method: "PATCH",
        body: JSON.stringify({ visibility }),
      });
      await loadLibrary();
      haptic("success");
      setToast({ kind: "success", message: visibility === "public" ? "Playlist is now public" : "Playlist is now private" });
    } catch (mutationError) {
      setToast({ kind: "error", message: mutationError instanceof Error ? mutationError.message : "Could not update visibility." });
    } finally {
      setMutating(false);
    }
  }

  async function sharePlaylist(playlist: Playlist) {
    setMutating(true);
    try {
      const result = await api<{ url: string }>(`/api/playlists/${playlist.id}/share`, { method: "POST" });
      haptic("success");
      await openShareFlow(result.url, `Listen to ${playlist.name}, a playlist by ${library?.user.firstName ?? "a tune user"}.`);
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      setToast({ kind: "error", message: shareError instanceof Error ? shareError.message : "Could not share playlist." });
    } finally {
      setMutating(false);
    }
  }

  async function addSharedSong() {
    if (!sharedPreview || sharedPreview.type !== "song") return;
    setMutating(true);
    try {
      const result = await api<{ created: boolean }>(`/api/shared/s_${sharedPreview.shareId}`, { method: "POST" });
      await loadLibrary();
      setSharedPreview(null);
      haptic("success");
      setToast({ kind: "success", message: result.created ? "Song added to your library" : "Song is already in your library" });
    } catch (mutationError) {
      setToast({ kind: "error", message: mutationError instanceof Error ? mutationError.message : "Could not add shared song." });
    } finally {
      setMutating(false);
    }
  }

  async function createPlaylist(name: string, description: string) {
    setMutating(true);
    try {
      const result = await api<{ id: string }>("/api/playlists", {
        method: "POST",
        body: JSON.stringify({ name, description }),
      });
      await loadLibrary();
      setCreateOpen(false);
      setSelectedPlaylistId(result.id);
      setTab("playlists");
      haptic("success");
      setToast({ kind: "success", message: "Playlist created" });
    } catch (mutationError) {
      setToast({ kind: "error", message: mutationError instanceof Error ? mutationError.message : "Could not create playlist." });
    } finally {
      setMutating(false);
    }
  }

  async function addToPlaylist(playlistId: string, trackId: string) {
    setMutating(true);
    try {
      await api(`/api/playlists/${playlistId}/tracks`, {
        method: "POST",
        body: JSON.stringify({ trackId }),
      });
      await loadLibrary();
      setTrackMenu(null);
      haptic("success");
      setToast({ kind: "success", message: "Added to playlist" });
    } catch (mutationError) {
      setToast({ kind: "error", message: mutationError instanceof Error ? mutationError.message : "Could not add track." });
    } finally {
      setMutating(false);
    }
  }

  async function addManyToPlaylist(playlistId: string, trackIds: string[]) {
    if (!trackIds.length) return;
    setMutating(true);
    try {
      const result = await api<{ added: number }>(`/api/playlists/${playlistId}/tracks`, {
        method: "POST",
        body: JSON.stringify({ trackIds }),
      });
      await loadLibrary();
      setAddMusicPlaylistId(null);
      haptic("success");
      setToast({
        kind: "success",
        message: result.added === 1 ? "Added 1 song" : `Added ${result.added} songs`,
      });
    } catch (mutationError) {
      setToast({ kind: "error", message: mutationError instanceof Error ? mutationError.message : "Could not add songs." });
    } finally {
      setMutating(false);
    }
  }

  async function removePlaylist(playlistId: string) {
    setMutating(true);
    try {
      await api(`/api/playlists/${playlistId}`, { method: "DELETE" });
      await loadLibrary();
      setDeletePlaylistTarget(null);
      setAddMusicPlaylistId(null);
      setSelectedPlaylistId(null);
      haptic("success");
      setToast({ kind: "success", message: "Playlist deleted. Your songs are still in Library." });
    } catch (mutationError) {
      setToast({ kind: "error", message: mutationError instanceof Error ? mutationError.message : "Could not delete playlist." });
    } finally {
      setMutating(false);
    }
  }

  async function removeFromPlaylist(playlistId: string, trackId: string) {
    setMutating(true);
    try {
      await api(`/api/playlists/${playlistId}/tracks/${trackId}`, { method: "DELETE" });
      await loadLibrary();
      setTrackMenu(null);
      haptic("success");
      setToast({ kind: "success", message: "Removed from playlist" });
    } catch (mutationError) {
      setToast({ kind: "error", message: mutationError instanceof Error ? mutationError.message : "Could not remove track." });
    } finally {
      setMutating(false);
    }
  }

  async function toggleTrackLiked(track: Track) {
    const nextLiked = !track.liked;
    setMutating(true);
    try {
      await api(`/api/tracks/${track.id}/like`, {
        method: "PUT",
        body: JSON.stringify({ liked: nextLiked }),
      });
      setQueue((current) => current.map((item) =>
        item.id === track.id ? { ...item, liked: nextLiked } : item,
      ));
      await loadLibrary();
      setTrackMenu(null);
      haptic("success");
      setToast({ kind: "success", message: nextLiked ? "Added to Liked Songs" : "Removed from Liked Songs" });
    } catch (mutationError) {
      setToast({ kind: "error", message: mutationError instanceof Error ? mutationError.message : "Could not update Liked Songs." });
    } finally {
      setMutating(false);
    }
  }

  function switchTab(next: Tab) {
    haptic();
    setTab(next);
    setSelectedPlaylistId(null);
    setSearch("");
  }

  function cycleTheme() {
    setThemeMode((current) => {
      if (current === "telegram") return hostTheme === "dark" ? "light" : "dark";
      if (current === hostTheme) return "telegram";
      return hostTheme;
    });
    haptic();
  }

  if (error) {
    return (
      <div className="app-frame">
        <main className="error-screen">
          <span className="brand-mark"><Music2 /></span>
          <p className="eyebrow">tune</p>
          <h1>Your library is out of reach.</h1>
          <p>{error}</p>
          <button className="primary-button" onClick={() => void loadLibrary()}>Try again</button>
        </main>
      </div>
    );
  }

  return (
    <div className={`app-frame ${currentTrack ? "has-player" : ""}`}>
      <audio
        ref={audioRef}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onLoadedMetadata={(event) => {
          const duration = Number.isFinite(event.currentTarget.duration)
            ? event.currentTarget.duration
            : currentTrack?.duration ?? 0;
          setMediaDuration(duration);
        }}
        onTimeUpdate={(event) => {
          const audio = event.currentTarget;
          setCurrentTime(audio.currentTime);
          if ("mediaSession" in navigator && Number.isFinite(audio.duration) && audio.duration > 0) {
            try {
              navigator.mediaSession.setPositionState({
                duration: audio.duration,
                playbackRate: audio.playbackRate,
                position: Math.min(audio.currentTime, audio.duration),
              });
            } catch { /* media position state is best-effort */ }
          }
        }}
        onEnded={() => {
          if (repeatOne && audioRef.current) {
            audioRef.current.currentTime = 0;
            void audioRef.current.play();
          } else {
            advanceTrack(1);
          }
        }}
        onError={() => {
          if (!audioRef.current?.getAttribute("src")) return;
          setIsPlaying(false);
          setToast({ kind: "error", message: "This track could not be streamed from Telegram." });
        }}
      />
      {!library ? <Skeleton /> : (
        <>
          {tab === "home" ? (
            <HomeScreen
              library={library}
              themeMode={themeMode}
              effectiveTheme={effectiveTheme}
              onThemeChange={cycleTheme}
              onSeeHistory={() => setHistoryOpen(true)}
              onPlay={(track) => startInAppQueue(
                library.tracks,
                false,
                library.tracks.findIndex((item) => item.id === track.id),
              )}
              onMore={setTrackMenu}
              onPlaylist={(id) => { setSelectedPlaylistId(id); setTab("playlists"); }}
              onSeeLibrary={() => switchTab("library")}
              onShuffle={() => startInAppQueue(library.tracks, true)}
              sending={sending}
            />
          ) : null}
          {tab === "library" ? (
            <LibraryScreen
              searchInputRef={searchInputRef}
              tracks={filteredTracks}
              total={library.tracks.length}
              search={search}
              setSearch={setSearch}
              onPlay={(track) => startInAppQueue(
                filteredTracks,
                false,
                filteredTracks.findIndex((item) => item.id === track.id),
              )}
              onMore={setTrackMenu}
              onShuffle={() => startInAppQueue(library.tracks, true)}
              sending={sending}
            />
          ) : null}
          {tab === "playlists" && !selectedPlaylist ? (
            <PlaylistsScreen
              playlists={library.playlists}
              onOpen={setSelectedPlaylistId}
              onCreate={() => setCreateOpen(true)}
            />
          ) : null}
          {tab === "playlists" && selectedPlaylist ? (
            <PlaylistDetail
              playlist={selectedPlaylist}
              onBack={() => setSelectedPlaylistId(null)}
              onPlay={() => startInAppQueue(selectedPlaylist.tracks)}
              onShuffle={() => startInAppQueue(selectedPlaylist.tracks, true)}
              onTrackPlay={(track) => startInAppQueue(
                selectedPlaylist.tracks,
                false,
                selectedPlaylist.tracks.findIndex((item) => item.id === track.id),
              )}
              onMore={setTrackMenu}
              onAddMusic={() => setAddMusicPlaylistId(selectedPlaylist.id)}
              onDelete={() => setDeletePlaylistTarget(selectedPlaylist)}
              onVisibility={() => void updatePlaylistVisibility(selectedPlaylist)}
              onShare={() => void sharePlaylist(selectedPlaylist)}
              busy={sending || mutating}
            />
          ) : null}

          <BottomNav tab={tab} onSelect={switchTab} />
          {currentTrack ? (
            <MiniPlayer
              track={currentTrack}
              isPlaying={isPlaying}
              progress={mediaDuration ? currentTime / mediaDuration : 0}
              onOpen={() => setPlayerOpen(true)}
              onToggle={togglePlayback}
            />
          ) : null}
        </>
      )}

      {createOpen ? (
        <CreatePlaylistSheet
          busy={mutating}
          onClose={() => setCreateOpen(false)}
          onCreate={(name, description) => void createPlaylist(name, description)}
        />
      ) : null}
      {addMusicPlaylistId && library ? (
        <AddMusicSheet
          playlist={library.playlists.find((playlist) => playlist.id === addMusicPlaylistId) ?? null}
          tracks={library.tracks}
          busy={mutating}
          onClose={() => setAddMusicPlaylistId(null)}
          onAdd={(trackIds) => void addManyToPlaylist(addMusicPlaylistId, trackIds)}
        />
      ) : null}
      {deletePlaylistTarget ? (
        <DeletePlaylistSheet
          playlist={deletePlaylistTarget}
          busy={mutating}
          onClose={() => setDeletePlaylistTarget(null)}
          onDelete={() => void removePlaylist(deletePlaylistTarget.id)}
        />
      ) : null}
      {queueOpen && currentTrack ? (
        <QueueSheet
          queue={queue}
          queueIndex={queueIndex}
          onClose={() => setQueueOpen(false)}
          onPlay={(index) => {
            setQueueIndex(index);
            activateTrack(queue[index]);
          }}
          onMove={moveQueueTrack}
          onRemove={removeQueueTrack}
          onClear={clearQueue}
        />
      ) : null}
      {historyOpen && library ? (
        <HistorySheet
          tracks={library.recentlyPlayed}
          onClose={() => setHistoryOpen(false)}
          onPlay={(track) => {
            setHistoryOpen(false);
            startInAppQueue(
              library.tracks,
              false,
              library.tracks.findIndex((item) => item.id === track.id),
            );
          }}
          onMore={(track) => {
            setHistoryOpen(false);
            setTrackMenu(track);
          }}
        />
      ) : null}
      {sharedPreview ? (
        <SharedItemSheet
          preview={sharedPreview}
          busy={mutating}
          onClose={() => setSharedPreview(null)}
          onAddSong={() => void addSharedSong()}
        />
      ) : null}
      {trackMenu && library ? (
        <TrackSheet
          track={trackMenu}
          playlists={library.playlists}
          currentPlaylist={selectedPlaylist}
          busy={mutating || sending}
          onClose={() => setTrackMenu(null)}
          onPlayNow={() => {
            setTrackMenu(null);
            startInAppQueue([trackMenu]);
          }}
          onSendTelegram={() => { setTrackMenu(null); void sendQueue([trackMenu.id]); }}
          onPlayNext={() => playTrackNext(trackMenu)}
          onToggleLiked={() => void toggleTrackLiked(trackMenu)}
          onShare={() => void shareTrack(trackMenu)}
          onAdd={addToPlaylist}
          onRemove={selectedPlaylist && selectedPlaylist.kind === "standard"
            ? () => void removeFromPlaylist(selectedPlaylist.id, trackMenu.id)
            : undefined}
          onNewPlaylist={() => { setTrackMenu(null); setCreateOpen(true); }}
        />
      ) : null}
      {currentTrack ? (
        <NowPlaying
          open={playerOpen}
          track={currentTrack}
          queuePosition={queueIndex + 1}
          queueLength={queue.length}
          currentTime={currentTime}
          duration={mediaDuration || currentTrack.duration}
          isPlaying={isPlaying}
          shuffleEnabled={shuffleEnabled}
          repeatOne={repeatOne}
          volume={volume}
          muted={muted}
          onClose={() => setPlayerOpen(false)}
          onToggle={togglePlayback}
          onPrevious={previousTrack}
          onNext={() => advanceTrack(1)}
          onSeek={seekTo}
          onShuffle={toggleShuffle}
          onRepeat={() => { setRepeatOne((value) => !value); haptic(); }}
          onVolumeChange={changeVolume}
          onMuteToggle={toggleMute}
          onMore={() => setTrackMenu(currentTrack)}
          onQueue={() => setQueueOpen(true)}
        />
      ) : null}
      {sending ? (
        <div className="sending-pill"><LoaderCircle className="spin" /> Preparing Telegram queue…</div>
      ) : null}
      {sharedLoading ? <div className="sending-pill"><LoaderCircle className="spin" /> Opening shared music…</div> : null}
      {toast ? (
        <div className={`toast toast-${toast.kind}`}>
          {toast.kind === "success" ? <Check /> : <X />}
          <span>{toast.message}</span>
        </div>
      ) : null}
    </div>
  );
}

function Header({
  name,
  photoUrl,
  themeMode,
  effectiveTheme,
  onThemeChange,
  subtitle = "Your music, right here.",
}: {
  name: string;
  photoUrl: string | null;
  themeMode: ThemeMode;
  effectiveTheme: ResolvedTheme;
  onThemeChange: () => void;
  subtitle?: string;
}) {
  const ThemeIcon = themeMode === "telegram"
    ? MonitorSmartphone
    : effectiveTheme === "dark"
      ? Moon
      : Sun;
  const themeLabel = themeMode === "telegram" ? `Telegram ${effectiveTheme}` : effectiveTheme;
  return (
    <header className="topbar">
      <div>
        <div className="wordmark"><span>t</span>une</div>
        <p>{subtitle}</p>
      </div>
      <div className="topbar-actions">
        <button className="theme-toggle" onClick={onThemeChange} aria-label={`Theme: ${themeLabel}. Change theme`} title={`Theme: ${themeLabel}`}>
          <ThemeIcon />
        </button>
        <div className="avatar" aria-label={`${name}'s profile`}>
          {photoUrl ? <span className="avatar-image" style={{ backgroundImage: `url(${photoUrl})` }} /> : name.charAt(0).toUpperCase()}
        </div>
      </div>
    </header>
  );
}

function HomeScreen({
  library,
  themeMode,
  effectiveTheme,
  onThemeChange,
  onSeeHistory,
  onPlay,
  onMore,
  onPlaylist,
  onSeeLibrary,
  onShuffle,
  sending,
}: {
  library: LibraryPayload;
  themeMode: ThemeMode;
  effectiveTheme: ResolvedTheme;
  onThemeChange: () => void;
  onSeeHistory: () => void;
  onPlay: (track: Track) => void;
  onMore: (track: Track) => void;
  onPlaylist: (id: string) => void;
  onSeeLibrary: () => void;
  onShuffle: () => void;
  sending: boolean;
}) {
  const featured = library.playlists.find((playlist) => playlist.trackCount > 0)
    ?? library.playlists.find((playlist) => playlist.kind === "standard")
    ?? library.playlists[0];
  const recent = library.tracks.slice(0, 4);
  return (
    <main className="screen home-screen">
      <Header
        name={library.user.firstName}
        photoUrl={library.user.photoUrl}
        themeMode={themeMode}
        effectiveTheme={effectiveTheme}
        onThemeChange={onThemeChange}
      />

      <section className="welcome-block">
        <p className="eyebrow">Good evening, {library.user.firstName}</p>
        <h1>What do you want<br />to hear?</h1>
        <button className="shuffle-all" onClick={onShuffle} disabled={sending || !library.tracks.length}>
          <Shuffle aria-hidden="true" /> Shuffle my library
        </button>
      </section>

      {featured ? (
        <button className="featured-card" onClick={() => onPlaylist(featured.id)}>
          <div className="featured-glow" />
          <div className="featured-label"><Sparkles /> For tonight</div>
          <div className="featured-copy">
            <h2>{featured.name}</h2>
            <p>{featured.description || `${featured.trackCount} songs from your library`}</p>
          </div>
          <div className="featured-art"><PlaylistCover playlist={featured} large /></div>
          <span className="round-play"><Play fill="currentColor" /></span>
        </button>
      ) : (
        <div className="featured-card starter-card">
          <div className="featured-label"><Sparkles /> Start a collection</div>
          <div className="featured-copy">
            <h2>Your first playlist</h2>
            <p>Head to Playlists to group the tracks you love.</p>
          </div>
        </div>
      )}

      <section className="section-block">
        <div className="section-heading">
          <div><p className="eyebrow">Freshly saved</p><h2>Recently added</h2></div>
          <button onClick={onSeeLibrary}>See all <ChevronRight /></button>
        </div>
        {recent.length ? recent.map((track) => (
          <TrackRow key={track.id} track={track} onPlay={() => onPlay(track)} onMore={() => onMore(track)} />
        )) : <EmptyState title="Your music inbox is empty" copy="Send or forward an audio track to the bot and it will appear here." />}
      </section>

      {library.recentlyPlayed.length ? (
        <section className="section-block">
          <div className="section-heading">
            <div><p className="eyebrow">Listen again</p><h2>Recently played</h2></div>
            <button onClick={onSeeHistory}>See all <ChevronRight /></button>
          </div>
          {library.recentlyPlayed.slice(0, 4).map((track) => (
            <TrackRow key={track.id} track={track} onPlay={() => onPlay(track)} onMore={() => onMore(track)} />
          ))}
        </section>
      ) : null}

      <div className="telegram-note">
        <span><Send /></span>
        <div><strong>Streamed from Telegram</strong><p>Your audio stays on Telegram. Tune streams it only while you listen.</p></div>
      </div>
    </main>
  );
}

function LibraryScreen({
  searchInputRef,
  tracks,
  total,
  search,
  setSearch,
  onPlay,
  onMore,
  onShuffle,
  sending,
}: {
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  tracks: Track[];
  total: number;
  search: string;
  setSearch: (value: string) => void;
  onPlay: (track: Track) => void;
  onMore: (track: Track) => void;
  onShuffle: () => void;
  sending: boolean;
}) {
  return (
    <main className="screen library-screen">
      <div className="page-heading">
        <div><p className="eyebrow">Your collection</p><h1>Library</h1></div>
        <button className="round-action" onClick={onShuffle} disabled={sending || !total} aria-label="Shuffle library"><Shuffle /></button>
      </div>
      <label className="search-box">
        <Search aria-hidden="true" />
        <input
          ref={searchInputRef}
          aria-keyshortcuts="Control+K Meta+K"
          aria-label="Search songs or artists"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search songs or artists"
        />
        {search ? <button onClick={() => setSearch("")} aria-label="Clear search"><X /></button> : null}
      </label>
      <div className="list-meta"><span>{search ? `${tracks.length} found` : `${total} songs`}</span><span>Recently added</span></div>
      <div className="track-list">
        {tracks.length ? tracks.map((track) => (
          <TrackRow key={track.id} track={track} onPlay={() => onPlay(track)} onMore={() => onMore(track)} />
        )) : (
          <EmptyState title={search ? "Nothing found" : "No songs yet"} copy={search ? "Try a different song or artist." : "Send an audio file to the bot to start your library."} />
        )}
      </div>
    </main>
  );
}

function PlaylistsScreen({ playlists, onOpen, onCreate }: { playlists: Playlist[]; onOpen: (id: string) => void; onCreate: () => void }) {
  return (
    <main className="screen playlists-screen">
      <div className="page-heading">
        <div><p className="eyebrow">Made by you</p><h1>Playlists</h1></div>
        <button className="round-action" onClick={onCreate} aria-label="Create playlist"><Plus /></button>
      </div>
      {playlists.length ? (
        <div className="playlist-grid">
          {playlists.map((playlist) => (
            <button className="playlist-card" key={playlist.id} onClick={() => onOpen(playlist.id)}>
              <PlaylistCover playlist={playlist} />
              <span className="playlist-card-title">{playlist.name}</span>
              <span className="playlist-card-meta">{playlist.trackCount} songs · {formatCollectionDuration(playlist.duration)}</span>
            </button>
          ))}
          <button className="new-playlist-card" onClick={onCreate}>
            <span><Plus /></span>
            <strong>New playlist</strong>
          </button>
        </div>
      ) : (
        <div className="playlist-empty-wrap">
          <EmptyState icon="playlist" title="Make your first playlist" copy="Collect the songs that belong together, then send the whole queue to Telegram in one tap." />
          <button className="primary-button" onClick={onCreate}><Plus /> New playlist</button>
        </div>
      )}
    </main>
  );
}

function PlaylistDetail({
  playlist,
  onBack,
  onPlay,
  onShuffle,
  onTrackPlay,
  onMore,
  onAddMusic,
  onDelete,
  onVisibility,
  onShare,
  busy,
}: {
  playlist: Playlist;
  onBack: () => void;
  onPlay: () => void;
  onShuffle: () => void;
  onTrackPlay: (track: Track) => void;
  onMore: (track: Track) => void;
  onAddMusic: () => void;
  onDelete: () => void;
  onVisibility: () => void;
  onShare: () => void;
  busy: boolean;
}) {
  return (
    <main className="screen playlist-detail">
      <button className="back-button" onClick={onBack}><ArrowLeft /> Playlists</button>
      <section className="playlist-hero">
        <PlaylistCover playlist={playlist} large />
        <p className="eyebrow">Playlist</p>
        <h1>{playlist.name}</h1>
        {playlist.description ? <p className="playlist-description">{playlist.description}</p> : null}
        <p className="playlist-stats">{playlist.trackCount} songs · {formatCollectionDuration(playlist.duration)}</p>
        <div className="playlist-actions">
          <button className="secondary-button playlist-add-music" onClick={onAddMusic} disabled={busy}><ListPlus /> Add music</button>
          <button className="secondary-button" onClick={onShuffle} disabled={busy || !playlist.trackCount}><Shuffle /> Shuffle</button>
          <button className="play-button" onClick={onPlay} disabled={busy || !playlist.trackCount}><Play fill="currentColor" /></button>
          {playlist.kind === "standard" ? (
            <button className="playlist-delete" onClick={onDelete} disabled={busy} aria-label={`Delete ${playlist.name}`} title="Delete playlist"><Trash2 /></button>
          ) : null}
        </div>
        {playlist.kind === "standard" ? (
          <div className="playlist-sharing-actions">
            <button onClick={onVisibility} disabled={busy}>
              {playlist.visibility === "public" ? <Globe2 /> : <Lock />}
              {playlist.visibility === "public" ? "Public" : "Private"}
            </button>
            <button onClick={onShare} disabled={busy || playlist.visibility !== "public"} title={playlist.visibility === "private" ? "Make this playlist public to share it" : "Share playlist"}>
              <Share2 /> Share
            </button>
          </div>
        ) : null}
      </section>
      <section className="playlist-track-list">
        {playlist.tracks.length ? playlist.tracks.map((track, index) => (
          <TrackRow key={track.id} track={track} ordinal={index + 1} onPlay={() => onTrackPlay(track)} onMore={() => onMore(track)} />
        )) : <EmptyState title="This playlist is waiting" copy="Use Add music to choose songs from your library." />}
      </section>
    </main>
  );
}

function MiniPlayer({
  track,
  isPlaying,
  progress,
  onOpen,
  onToggle,
}: {
  track: Track;
  isPlaying: boolean;
  progress: number;
  onOpen: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="mini-player">
      <button className="mini-player-main" onClick={onOpen} aria-label={`Open player for ${track.title}`}>
        <Cover seed={track.artworkSeed} size="small" label={track.title} artworkUrl={track.artworkUrl} />
        <span><strong>{track.title}</strong><small>{track.artist}</small></span>
      </button>
      <button className="mini-play-button" onClick={onToggle} aria-label={isPlaying ? "Pause" : "Play"}>
        {isPlaying ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
      </button>
      <span className="mini-progress"><i style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} /></span>
    </div>
  );
}

function NowPlaying({
  open,
  track,
  queuePosition,
  queueLength,
  currentTime,
  duration,
  isPlaying,
  shuffleEnabled,
  repeatOne,
  volume,
  muted,
  onClose,
  onToggle,
  onPrevious,
  onNext,
  onSeek,
  onShuffle,
  onRepeat,
  onVolumeChange,
  onMuteToggle,
  onMore,
  onQueue,
}: {
  open: boolean;
  track: Track;
  queuePosition: number;
  queueLength: number;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  shuffleEnabled: boolean;
  repeatOne: boolean;
  volume: number;
  muted: boolean;
  onClose: () => void;
  onToggle: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (seconds: number) => void;
  onShuffle: () => void;
  onRepeat: () => void;
  onVolumeChange: (volume: number) => void;
  onMuteToggle: () => void;
  onMore: () => void;
  onQueue: () => void;
}) {
  const [volumeOpen, setVolumeOpen] = useState(false);
  const safeDuration = Math.max(duration || 0, 0);
  const displayedVolume = muted ? 0 : volume;
  const VolumeIcon = muted || volume === 0 ? VolumeX : Volume2;
  return (
    <section
      className={`now-playing cover-${track.artworkSeed % 8} ${open ? "now-playing-open" : ""}`}
      role="dialog"
      aria-modal={open ? "true" : undefined}
      aria-hidden={!open}
      aria-label="Now playing"
    >
      <div className="now-playing-wash" />
      <header className="player-header">
        <button onClick={onClose} aria-label="Minimize player"><ChevronDown /></button>
        <div><span>Now playing</span><strong>From your Telegram library · {queuePosition}/{queueLength}</strong></div>
        <button onClick={onMore} aria-label={`More options for ${track.title}`}><MoreHorizontal /></button>
      </header>
      <div className="player-content">
        <div className="hero-cover-wrap">
          <Cover seed={track.artworkSeed} size="hero" label={track.title} artworkUrl={track.artworkUrl} />
          <span className="artwork-source">{track.artworkUrl ? "Telegram album artwork" : "tune artwork"}</span>
        </div>
        <div className="now-playing-copy">
          <p className="eyebrow">Playing now</p>
          <h1>{track.title}</h1>
          <p>{track.artist}</p>
        </div>
        <div className="player-timeline">
          <input
            aria-label="Seek"
            type="range"
            min="0"
            max={safeDuration || 1}
            step="0.1"
            value={Math.min(currentTime, safeDuration || 1)}
            onChange={(event) => onSeek(Number(event.target.value))}
            style={{ "--progress": `${safeDuration ? (currentTime / safeDuration) * 100 : 0}%` } as React.CSSProperties}
          />
          <div><span>{formatPlaybackTime(currentTime)}</span><span>-{formatPlaybackTime(Math.max(0, safeDuration - currentTime))}</span></div>
        </div>
        <div className="player-controls">
          <button className={shuffleEnabled ? "active" : ""} onClick={onShuffle} aria-label="Shuffle"><Shuffle /></button>
          <button onClick={onPrevious} aria-label="Previous track"><SkipBack fill="currentColor" /></button>
          <button className="player-main-control" onClick={onToggle} aria-keyshortcuts="Space" aria-label={isPlaying ? "Pause" : "Play"}>
            {isPlaying ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
          </button>
          <button onClick={onNext} aria-label="Next track"><SkipForward fill="currentColor" /></button>
          <button className={repeatOne ? "active" : ""} onClick={onRepeat} aria-label="Repeat track"><Repeat2 /></button>
        </div>
        <button className="queue-open-button" onClick={onQueue}>
          <ListMusic />
          <span>Open queue</span>
          <strong>{queuePosition} of {queueLength}</strong>
          <ChevronRight />
        </button>
        <div className="player-utility-row">
          <div className="streaming-badge"><span /><strong>Streaming securely</strong> from Telegram</div>
          <div className={`volume-control ${volumeOpen ? "volume-control-open" : ""}`}>
            <button
              className="volume-disclosure"
              onClick={() => setVolumeOpen((value) => !value)}
              aria-expanded={volumeOpen}
              aria-controls="player-volume-panel"
              aria-label="Volume controls"
            >
              <VolumeIcon />
            </button>
            <div className="volume-panel" id="player-volume-panel" aria-hidden={!volumeOpen}>
              <button
                onClick={onMuteToggle}
                disabled={!volumeOpen}
                aria-label={muted ? "Unmute" : "Mute"}
                title={muted ? "Unmute" : "Mute"}
              >
                <VolumeIcon />
              </button>
              <input
                aria-label="Volume"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={displayedVolume}
                disabled={!volumeOpen}
                onChange={(event) => onVolumeChange(Number(event.target.value))}
                style={{ "--volume": `${displayedVolume * 100}%` } as React.CSSProperties}
              />
              <output>{Math.round(displayedVolume * 100)}%</output>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function BottomNav({ tab, onSelect }: { tab: Tab; onSelect: (tab: Tab) => void }) {
  const items: Array<{ id: Tab; label: string; Icon: typeof House }> = [
    { id: "home", label: "Home", Icon: House },
    { id: "library", label: "Library", Icon: Library },
    { id: "playlists", label: "Playlists", Icon: ListMusic },
  ];
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {items.map(({ id, label, Icon }) => (
        <button className={tab === id ? "active" : ""} onClick={() => onSelect(id)} key={id}>
          <Icon fill={tab === id ? "currentColor" : "none"} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function Sheet({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="sheet-layer" role="dialog" aria-modal="true" aria-label={title}>
      <button className="sheet-backdrop" onClick={onClose} aria-label="Close" />
      <div className="sheet">
        <div className="sheet-handle" />
        {children}
      </div>
    </div>
  );
}

function CreatePlaylistSheet({ busy, onClose, onCreate }: { busy: boolean; onClose: () => void; onCreate: (name: string, description: string) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  return (
    <Sheet onClose={onClose} title="Create playlist">
      <div className="sheet-heading"><div><p className="eyebrow">A new collection</p><h2>Create playlist</h2></div><button className="icon-button" onClick={onClose}><X /></button></div>
      <form className="playlist-form" onSubmit={(event) => { event.preventDefault(); if (name.trim()) onCreate(name.trim(), description.trim()); }}>
        <label><span>Name</span><input autoFocus maxLength={60} value={name} onChange={(event) => setName(event.target.value)} placeholder="late night drive" /></label>
        <label><span>Description <em>optional</em></span><textarea maxLength={160} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What does this playlist feel like?" rows={3} /></label>
        <button className="primary-button full-button" type="submit" disabled={!name.trim() || busy}>
          {busy ? <LoaderCircle className="spin" /> : <Plus />} Create playlist
        </button>
      </form>
    </Sheet>
  );
}

function AddMusicSheet({
  playlist,
  tracks,
  busy,
  onClose,
  onAdd,
}: {
  playlist: Playlist | null;
  tracks: Track[];
  busy: boolean;
  onClose: () => void;
  onAdd: (trackIds: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const existingIds = useMemo(
    () => new Set(playlist?.tracks.map((track) => track.id) ?? []),
    [playlist?.tracks],
  );
  const availableTracks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return tracks.filter((track) =>
      !existingIds.has(track.id)
      && (!query || `${track.title} ${track.artist}`.toLocaleLowerCase().includes(query)),
    );
  }, [existingIds, search, tracks]);

  if (!playlist) return null;

  function toggleTrack(trackId: string) {
    setSelectedIds((current) => current.includes(trackId)
      ? current.filter((id) => id !== trackId)
      : [...current, trackId]);
  }

  return (
    <Sheet onClose={onClose} title={`Add music to ${playlist.name}`}>
      <div className="sheet-heading">
        <div><p className="eyebrow">{playlist.name}</p><h2>Add music</h2></div>
        <button className="icon-button" onClick={onClose} aria-label="Close"><X /></button>
      </div>
      <label className="search-box music-picker-search">
        <Search aria-hidden="true" />
        <input
          autoFocus
          aria-label="Search your library"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search your library"
        />
        {search ? <button onClick={() => setSearch("")} aria-label="Clear search"><X /></button> : null}
      </label>
      <div className="music-picker-list">
        {availableTracks.length ? availableTracks.map((track) => {
          const selected = selectedIds.includes(track.id);
          return (
            <button
              type="button"
              className={selected ? "selected" : ""}
              key={track.id}
              aria-pressed={selected}
              disabled={busy}
              onClick={() => toggleTrack(track.id)}
            >
              <Cover seed={track.artworkSeed} size="small" label={track.title} artworkUrl={track.artworkUrl} />
              <span><strong>{track.title}</strong><small>{track.artist} · {formatDuration(track.duration)}</small></span>
              <i>{selected ? <Check /> : <Plus />}</i>
            </button>
          );
        }) : (
          <p className="music-picker-empty">
            {search ? "No matching songs are available." : "Every song in your library is already in this playlist."}
          </p>
        )}
      </div>
      <div className="music-picker-footer">
        <span>{selectedIds.length ? `${selectedIds.length} selected` : "Choose one or more songs"}</span>
        <button className="primary-button" disabled={busy || !selectedIds.length} onClick={() => onAdd(selectedIds)}>
          {busy ? <LoaderCircle className="spin" /> : <ListPlus />}
          Add {selectedIds.length || "music"}
        </button>
      </div>
    </Sheet>
  );
}

function DeletePlaylistSheet({
  playlist,
  busy,
  onClose,
  onDelete,
}: {
  playlist: Playlist;
  busy: boolean;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <Sheet onClose={onClose} title={`Delete ${playlist.name}`}>
      <div className="delete-playlist-confirmation">
        <span><Trash2 /></span>
        <p className="eyebrow">Delete playlist</p>
        <h2>Delete “{playlist.name}”?</h2>
        <p>The playlist will be removed, but its {playlist.trackCount === 1 ? "song stays" : "songs stay"} in your Library.</p>
        <div>
          <button className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="danger-button" onClick={onDelete} disabled={busy}>
            {busy ? <LoaderCircle className="spin" /> : <Trash2 />} Delete playlist
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function QueueSheet({
  queue,
  queueIndex,
  onClose,
  onPlay,
  onMove,
  onRemove,
  onClear,
}: {
  queue: Track[];
  queueIndex: number;
  onClose: () => void;
  onPlay: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (index: number) => void;
  onClear: () => void;
}) {
  return (
    <Sheet onClose={onClose} title="Playback queue">
      <div className="sheet-heading queue-heading">
        <div><p className="eyebrow">{queue.length} {queue.length === 1 ? "song" : "songs"}</p><h2>Queue</h2></div>
        <button className="icon-button" onClick={onClose} aria-label="Close queue"><X /></button>
      </div>
      <div className="queue-sheet-list">
        {queue.map((track, index) => {
          const active = index === queueIndex;
          return (
            <div className={`queue-sheet-row ${active ? "active" : ""}`} key={`${track.id}-${index}`}>
              <button className="queue-track-main" onClick={() => onPlay(index)} disabled={active}>
                <Cover seed={track.artworkSeed} size="small" label={track.title} artworkUrl={track.artworkUrl} />
                <span>
                  <strong>{track.title}</strong>
                  <small>{active ? "Playing now" : `${track.artist} · ${formatDuration(track.duration)}`}</small>
                </span>
              </button>
              <div className="queue-row-actions">
                <button onClick={() => onMove(index, -1)} disabled={index === 0} aria-label={`Move ${track.title} up`}><ArrowUp /></button>
                <button onClick={() => onMove(index, 1)} disabled={index === queue.length - 1} aria-label={`Move ${track.title} down`}><ArrowDown /></button>
                <button className="queue-remove" onClick={() => onRemove(index)} aria-label={`Remove ${track.title} from queue`}><X /></button>
              </div>
            </div>
          );
        })}
      </div>
      <button className="clear-queue-button" onClick={onClear}><Trash2 /> Clear queue</button>
    </Sheet>
  );
}

function HistorySheet({
  tracks,
  onClose,
  onPlay,
  onMore,
}: {
  tracks: Track[];
  onClose: () => void;
  onPlay: (track: Track) => void;
  onMore: (track: Track) => void;
}) {
  return (
    <Sheet onClose={onClose} title="Listening history">
      <div className="sheet-heading history-heading">
        <div><p className="eyebrow">Listen again</p><h2>Recently played</h2></div>
        <button className="icon-button" onClick={onClose} aria-label="Close history"><X /></button>
      </div>
      <div className="history-sheet-list">
        {tracks.map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            onPlay={() => onPlay(track)}
            onMore={() => onMore(track)}
          />
        ))}
      </div>
    </Sheet>
  );
}

function SharedItemSheet({
  preview,
  busy,
  onClose,
  onAddSong,
}: {
  preview: SharedPreview;
  busy: boolean;
  onClose: () => void;
  onAddSong: () => void;
}) {
  if (preview.type === "song") {
    return (
      <Sheet onClose={onClose} title={`Shared song: ${preview.title}`}>
        <div className="shared-item-heading">
          <button className="icon-button" onClick={onClose} aria-label="Close shared song"><X /></button>
          <Cover seed={preview.artworkSeed} size="large" label={preview.title} />
          <p className="eyebrow">{preview.ownerName} sent you a song</p>
          <h2>{preview.title}</h2>
          <p>{preview.artist} · {formatDuration(preview.duration)}</p>
        </div>
        <button className="primary-button full-button" onClick={onAddSong} disabled={busy || preview.alreadyAdded}>
          {busy ? <LoaderCircle className="spin" /> : preview.alreadyAdded ? <Check /> : <Plus />}
          {preview.alreadyAdded ? "Already in your library" : "Add to my library"}
        </button>
      </Sheet>
    );
  }

  return (
    <Sheet onClose={onClose} title={`Shared playlist: ${preview.name}`}>
      <div className="sheet-heading shared-playlist-heading">
        <div><p className="eyebrow">Public playlist by {preview.ownerName}</p><h2>{preview.name}</h2></div>
        <button className="icon-button" onClick={onClose} aria-label="Close shared playlist"><X /></button>
      </div>
      {preview.description ? <p className="shared-playlist-description">{preview.description}</p> : null}
      <p className="shared-playlist-stats">{preview.trackCount} songs · {formatCollectionDuration(preview.duration)}</p>
      <div className="shared-playlist-tracks">
        {preview.tracks.map((track, index) => (
          <div key={`${track.title}-${track.artist}-${index}`}>
            <Cover seed={track.artworkSeed} size="small" label={track.title} />
            <span><strong>{track.title}</strong><small>{track.artist}</small></span>
            <em>{formatDuration(track.duration)}</em>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function TrackSheet({
  track,
  playlists,
  currentPlaylist,
  busy,
  onClose,
  onPlayNow,
  onSendTelegram,
  onPlayNext,
  onToggleLiked,
  onShare,
  onAdd,
  onRemove,
  onNewPlaylist,
}: {
  track: Track;
  playlists: Playlist[];
  currentPlaylist: Playlist | null;
  busy: boolean;
  onClose: () => void;
  onPlayNow: () => void;
  onSendTelegram: () => void;
  onPlayNext: () => void;
  onToggleLiked: () => void;
  onShare: () => void;
  onAdd: (playlistId: string, trackId: string) => void;
  onRemove?: () => void;
  onNewPlaylist: () => void;
}) {
  const standardPlaylists = playlists.filter((playlist) => playlist.kind === "standard");
  return (
    <Sheet onClose={onClose} title={`Options for ${track.title}`}>
      <div className="sheet-track">
        <Cover seed={track.artworkSeed} size="medium" label={track.title} artworkUrl={track.artworkUrl} />
        <div><h2>{track.title}</h2><p>{track.artist}</p></div>
        <button className="icon-button" onClick={onClose}><X /></button>
      </div>
      <button className="sheet-action play-now-action" onClick={onPlayNow} disabled={busy || !track.playable}><span><Play fill="currentColor" /></span><div><strong>Play now</strong><small>Listen here with full controls</small></div><ChevronRight /></button>
      <button className="sheet-action queue-next-action" onClick={onPlayNext} disabled={busy || !track.playable}><span><ListPlus /></span><div><strong>Play next</strong><small>Put it after the current song</small></div><ChevronRight /></button>
      <button className={`sheet-action liked-action ${track.liked ? "liked" : ""}`} onClick={onToggleLiked} disabled={busy}>
        <span><Heart fill={track.liked ? "currentColor" : "none"} /></span>
        <div><strong>{track.liked ? "Remove from Liked Songs" : "Add to Liked Songs"}</strong><small>{track.liked ? "Keep the song in your library" : "Save it with your favorites"}</small></div>
        <ChevronRight />
      </button>
      <button className="sheet-action share-action" onClick={onShare} disabled={busy}><span><Share2 /></span><div><strong>Share song</strong><small>Send a direct tune link</small></div><ChevronRight /></button>
      <button className="sheet-action" onClick={onSendTelegram} disabled={busy}><span><Send /></span><div><strong>Send to Telegram player</strong><small>Play it as an audio message in chat</small></div><ChevronRight /></button>
      {onRemove ? <button className="sheet-action danger-action" onClick={onRemove} disabled={busy}><span><X /></span><div><strong>Remove from {currentPlaylist?.name}</strong><small>The song stays in your library</small></div><ChevronRight /></button> : null}
      <div className="sheet-divider" />
      <div className="sheet-subheading"><span>Add to playlist</span><button onClick={onNewPlaylist}><Plus /> New</button></div>
      <div className="playlist-options">
        {standardPlaylists.length ? standardPlaylists.map((playlist) => {
          const alreadyAdded = playlist.tracks.some((item) => item.id === track.id);
          return (
            <button key={playlist.id} disabled={busy || alreadyAdded} onClick={() => onAdd(playlist.id, track.id)}>
              <PlaylistCover playlist={playlist} />
              <span><strong>{playlist.name}</strong><small>{playlist.trackCount} songs</small></span>
              {alreadyAdded ? <Check className="added-check" /> : <ListPlus />}
            </button>
          );
        }) : <p className="no-playlists">No playlists yet. Create one to start collecting tracks.</p>}
      </div>
    </Sheet>
  );
}
