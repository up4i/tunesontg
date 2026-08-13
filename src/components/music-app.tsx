"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bell,
  Bug,
  Check,
  ChevronDown,
  ChevronRight,
  Globe2,
  Heart,
  House,
  ImagePlus,
  Inbox,
  Library,
  Folder,
  FolderPlus,
  ListMusic,
  ListPlus,
  LoaderCircle,
  Lock,
  MonitorSmartphone,
  MoreHorizontal,
  Moon,
  Music2,
  Pause,
  Pencil,
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
  UserPlus,
  UserRound,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { encodePlayerState, restorePlayerState } from "@/lib/player-state";
import type { LibraryPayload, Playlist, PlaylistFolder, SharedPreview, Track } from "@/lib/types";

type Tab = "home" | "library" | "playlists" | "profile";
type ThemeMode = "telegram" | "light" | "dark";
type ResolvedTheme = "light" | "dark";
type RepeatMode = "off" | "all" | "one";
type Toast = { kind: "success" | "error"; message: string } | null;
type PlaybackEventName = "play_request" | "playback_started" | "buffer_start" | "buffer_end" | "stream_error" | "retry_started" | "retry_recovered" | "skip";
const primedStreamRequests = new Map<string, Promise<void>>();
const PLAYER_STATE_KEY = "tune:player-state:v1";

function haptic(kind: "selection" | "success" | "error" = "selection") {
  const webApp = window.Telegram?.WebApp;
  if (!webApp?.isVersionAtLeast("6.1")) return;
  const feedback = webApp.HapticFeedback;
  if (kind === "selection") feedback?.selectionChanged();
  else feedback?.notificationOccurred(kind);
}

function primeTrackStream(track: Track): Promise<void> {
  if (!track.playable || !track.streamUrl) return Promise.resolve();
  const existing = primedStreamRequests.get(track.streamUrl);
  if (existing) return existing;

  const streamUrl = track.streamUrl;
  const request = fetch(streamUrl, {
    cache: "force-cache",
    headers: { range: "bytes=0-262143", "x-telegram-init-data": initData() },
  }).then(async (response) => {
    if (!response.ok) throw new Error("Could not prepare audio.");
    await response.arrayBuffer();
  }).catch(() => {
    primedStreamRequests.delete(streamUrl);
  });
  if (primedStreamRequests.size >= 64) {
    const oldestUrl = primedStreamRequests.keys().next().value;
    if (oldestUrl) primedStreamRequests.delete(oldestUrl);
  }
  primedStreamRequests.set(streamUrl, request);
  return request;
}

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

function formatSongCount(count: number): string {
  return `${count} ${count === 1 ? "song" : "songs"}`;
}

function formatPlaylistCount(count: number): string {
  return `${count} ${count === 1 ? "playlist" : "playlists"}`;
}

function formatRelativeDate(value: string): string {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (elapsedSeconds < 60) return "Just now";
  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d ago` : new Date(value).toLocaleDateString();
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

async function squareArtworkFromFile(file: File, maxBytes = 750_000): Promise<string> {
  if (!/^image\/(?:jpeg|png|webp)$/.test(file.type)) {
    throw new Error("Choose a JPEG, PNG, or WebP image.");
  }
  if (file.size > 8_000_000) throw new Error("Choose an image smaller than 8 MB.");

  const image = document.createElement("img");
  const objectUrl = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("That image could not be opened."));
      image.src = objectUrl;
    });
    const sizes = [640, 520, 420];
    const qualities = [0.86, 0.78, 0.7];
    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
    const sourceX = (image.naturalWidth - sourceSize) / 2;
    const sourceY = (image.naturalHeight - sourceSize) / 2;

    for (let index = 0; index < sizes.length; index += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = sizes[index];
      canvas.height = sizes[index];
      const context = canvas.getContext("2d");
      if (!context) break;
      context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, sizes[index], sizes[index]);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", qualities[index]));
      if (!blob) continue;
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("That image could not be prepared."));
        reader.readAsDataURL(blob);
      });
      if (blob.size <= maxBytes) return dataUrl;
    }
    throw new Error("That image is too detailed. Try a simpler or smaller image.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
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

function UserAvatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!photoUrl || failedUrl === photoUrl) return <span className="user-avatar-fallback">{name.charAt(0).toUpperCase()}</span>;
  return (
    // Telegram supplies this URL, so a native image is the correct fit here.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={photoUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailedUrl(photoUrl)} />
  );
}

function PlaylistCover({
  playlist,
  large = false,
}: {
  playlist: Pick<Playlist, "name" | "coverImage" | "coverSeed" | "kind"> | {
    name: string; coverImage: string | null; coverSeed: number | null; kind?: "standard" | "liked"; tracks?: Track[];
  };
  large?: boolean;
}) {
  if (playlist.kind === "liked") {
    return (
      <div
        className={`playlist-cover playlist-cover-custom playlist-cover-liked ${large ? "playlist-cover-large" : ""}`}
        aria-label="Liked Songs cover"
      >
        <Heart aria-hidden="true" fill="currentColor" />
      </div>
    );
  }
  if (playlist.coverImage) {
    return (
      <div
        className={`playlist-cover playlist-cover-image ${large ? "playlist-cover-large" : ""}`}
        aria-label={`${playlist.name} cover`}
        style={{ backgroundImage: `url(${playlist.coverImage})` }}
      />
    );
  }
  if (playlist.coverSeed !== null) {
    return (
      <div
        className={`playlist-cover playlist-cover-custom cover-${playlist.coverSeed % 8} ${large ? "playlist-cover-large" : ""}`}
        aria-label={`${playlist.name} cover`}
      >
        <Music2 aria-hidden="true" />
      </div>
    );
  }
  const tracks = ("tracks" in playlist && playlist.tracks ? playlist.tracks : []).slice(0, 4);
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
          {index === 3 && !track ? <Music2 aria-hidden="true" /> : null}
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
  selecting = false,
  selected = false,
  onSelect,
  onSwipeQueue,
  onSwipeLike,
}: {
  track: Track;
  onPlay: () => void;
  onMore: () => void;
  ordinal?: number;
  selecting?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onSwipeQueue?: () => void;
  onSwipeLike?: () => void;
}) {
  const swipeRef = useRef<{ pointerId: number; startX: number; startY: number } | null>(null);
  const suppressSwipeClickRef = useRef(false);
  const [swipeX, setSwipeX] = useState(0);
  return (
    <div
      className={`track-swipe-shell ${swipeX > 0 ? "swiping-queue" : swipeX < 0 ? "swiping-like" : ""}`}
      onClickCapture={(event) => {
        if (!suppressSwipeClickRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        suppressSwipeClickRef.current = false;
      }}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse" || selecting || (!onSwipeQueue && !onSwipeLike)) return;
        swipeRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const swipe = swipeRef.current;
        if (!swipe || swipe.pointerId !== event.pointerId) return;
        const deltaX = event.clientX - swipe.startX;
        const deltaY = event.clientY - swipe.startY;
        if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 8) {
          swipeRef.current = null;
          setSwipeX(0);
          return;
        }
        if (Math.abs(deltaX) > 6) setSwipeX(Math.max(-96, Math.min(96, deltaX)));
      }}
      onPointerUp={(event) => {
        const swipe = swipeRef.current;
        if (!swipe || swipe.pointerId !== event.pointerId) return;
        const deltaX = event.clientX - swipe.startX;
        swipeRef.current = null;
        setSwipeX(0);
        suppressSwipeClickRef.current = Math.abs(deltaX) >= 24;
        if (suppressSwipeClickRef.current) {
          window.setTimeout(() => { suppressSwipeClickRef.current = false; }, 0);
        }
        if (deltaX >= 68) onSwipeQueue?.();
        else if (deltaX <= -68) onSwipeLike?.();
      }}
      onPointerCancel={() => { swipeRef.current = null; setSwipeX(0); }}
    >
      <span className="track-swipe-action track-swipe-queue" aria-hidden="true"><ListPlus /><strong>Queue</strong></span>
      <span className="track-swipe-action track-swipe-like" aria-hidden="true"><Heart /><strong>Like</strong></span>
      <div
        className={`track-row ${selected ? "track-row-selected" : ""}`}
        style={{ transform: `translateX(${swipeX}px)` }}
      >
        <button
          className="track-main"
          onPointerEnter={() => { if (!selecting) primeTrackStream(track); }}
          onPointerDown={() => { if (!selecting) primeTrackStream(track); }}
          onClick={selecting ? onSelect : onPlay}
          aria-label={selecting ? `${selected ? "Deselect" : "Select"} ${track.title}` : `Play ${track.title}`}
        >
          {selecting ? (
            <span className={`selection-check ${selected ? "selected" : ""}`}>{selected ? <Check /> : null}</span>
          ) : ordinal ? <span className="track-number">{ordinal}</span> : <Cover seed={track.artworkSeed} size="small" label={track.title} artworkUrl={track.artworkUrl} />}
          <span className="track-copy">
            <span className="track-title">{track.title}</span>
            <span className="track-artist">{track.artist}</span>
          </span>
        </button>
        <span className="track-duration">{formatDuration(track.duration)}</span>
        <button className="icon-button track-more" onClick={selecting ? onSelect : onMore} aria-label={selecting ? `Toggle selection for ${track.title}` : `More options for ${track.title}`}>
          {selecting ? selected ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" /> : <MoreHorizontal aria-hidden="true" />}
        </button>
      </div>
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
      <div className="loading-brand">
        <span className="brand-mark"><Music2 /></span>
        <div><strong>UTYA</strong><small>Tuning your Telegram library…</small></div>
      </div>
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
  const knownLibraryTrackIdsRef = useRef<Set<string> | null>(null);
  const playerStateRestoredRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const playbackSessionRef = useRef("");
  const playIntentAtRef = useRef<number | null>(null);
  const waitingAtRef = useRef<number | null>(null);
  const playbackRetryRef = useRef<{ trackId: string; attempts: number }>({ trackId: "", attempts: 0 });
  const retryTimerRef = useRef(0);
  const currentTrackRef = useRef<Track | null>(null);
  const [library, setLibrary] = useState<LibraryPayload | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editPlaylistTarget, setEditPlaylistTarget] = useState<Playlist | null>(null);
  const [editTrackTarget, setEditTrackTarget] = useState<Track | null>(null);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [folderEditor, setFolderEditor] = useState<PlaylistFolder | "new" | null>(null);
  const [addMusicPlaylistId, setAddMusicPlaylistId] = useState<string | null>(null);
  const [bulkPlaylistOpen, setBulkPlaylistOpen] = useState(false);
  const [deletePlaylistTarget, setDeletePlaylistTarget] = useState<Playlist | null>(null);
  const [deleteTrackTargets, setDeleteTrackTargets] = useState<Track[]>([]);
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [trackMenu, setTrackMenu] = useState<Track | null>(null);
  const [sending, setSending] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [playbackStack, setPlaybackStack] = useState<Track[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sharedPreview, setSharedPreview] = useState<SharedPreview | null>(null);
  const [sharedLoading, setSharedLoading] = useState(false);
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [bufferingMessage, setBufferingMessage] = useState<string | null>(null);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);
  const [pendingPlaylistCreate, setPendingPlaylistCreate] = useState<{
    trackIds: string[];
    moveFromPlaylistId?: string;
  } | null>(null);
  const [canAddHomeScreen, setCanAddHomeScreen] = useState(false);
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
      const nextLibrary = await api<LibraryPayload>("/api/library");
      knownLibraryTrackIdsRef.current = new Set(nextLibrary.tracks.map((track) => track.id));
      setLibrary(nextLibrary);
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
      const supportsHomeScreen = Boolean(webApp?.isVersionAtLeast("8.0") && webApp.addToHomeScreen);
      setCanAddHomeScreen(supportsHomeScreen);
      if (supportsHomeScreen && webApp?.checkHomeScreenStatus) {
        webApp.checkHomeScreenStatus((status) => {
          setCanAddHomeScreen(status === "missed" || status === "unknown");
        });
      }
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
    const webApp = window.Telegram?.WebApp;
    if (!webApp?.onEvent || !webApp.isVersionAtLeast("8.0")) return;
    const added = () => {
      setCanAddHomeScreen(false);
      haptic("success");
      setToast({ kind: "success", message: "tune was added to your Home Screen" });
    };
    webApp.onEvent("homeScreenAdded", added);
    return () => {
      webApp.offEvent?.("homeScreenAdded", added);
    };
  }, []);

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
    if (!token || !/^[spu]_[a-f\d]{32}$/.test(token)) return;
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
  const selectedTracks = useMemo(() => {
    const selected = new Set(selectedTrackIds);
    const source = selectedPlaylist?.tracks ?? library?.tracks ?? [];
    return source.filter((track) => selected.has(track.id));
  }, [library?.tracks, selectedPlaylist?.tracks, selectedTrackIds]);
  const currentTrack = queue[queueIndex] ?? null;
  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  const recordPlaybackEvent = useCallback((
    event: PlaybackEventName,
    trackId: string | null,
    details: { startupMs?: number; positionSeconds?: number; detail?: string } = {},
  ) => {
    if (!playbackSessionRef.current) playbackSessionRef.current = crypto.randomUUID().replaceAll("-", "");
    void fetch("/api/playback-events", {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json", "x-telegram-init-data": initData() },
      body: JSON.stringify({
        events: [{
          event,
          trackId,
          sessionId: playbackSessionRef.current,
          ...details,
        }],
      }),
    }).catch(() => { /* Diagnostics must never interrupt playback. */ });
  }, []);
  const filteredTracks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return library?.tracks ?? [];
    return (library?.tracks ?? []).filter((track) =>
      `${track.title} ${track.artist}`.toLocaleLowerCase().includes(query),
    );
  }, [library?.tracks, search]);

  const refreshLibraryInBackground = useCallback(async () => {
    try {
      const nextLibrary = await api<LibraryPayload>("/api/library");
      const previousIds = knownLibraryTrackIdsRef.current;
      const additions = previousIds
        ? nextLibrary.tracks.filter((track) => !previousIds.has(track.id))
        : [];
      knownLibraryTrackIdsRef.current = new Set(nextLibrary.tracks.map((track) => track.id));
      setLibrary(nextLibrary);
      if (additions.length) {
        haptic("success");
        setToast({
          kind: "success",
          message: additions.length === 1
            ? `“${additions[0].title}” was added to My Library`
            : `${additions.length} new songs were added to My Library`,
        });
      }
    } catch {
      // A background refresh should never replace the usable app with an error screen.
    }
  }, []);

  useEffect(() => {
    library?.tracks.slice(0, 4).forEach((track) => void primeTrackStream(track));
  }, [library]);

  useEffect(() => {
    if (!library || playerStateRestoredRef.current) return;
    playerStateRestoredRef.current = true;
    const restored = restorePlayerState(window.localStorage.getItem(PLAYER_STATE_KEY), library.tracks);
    if (!restored) return;
    const timer = window.setTimeout(() => {
      setQueue(restored.queue);
      setQueueIndex(restored.queueIndex);
      setPlaybackStack(restored.playbackStack);
      setShuffleEnabled(restored.shuffleEnabled);
      setRepeatMode(restored.repeatMode);
      setCurrentTime(restored.currentTime);
      setMediaDuration(restored.queue[restored.queueIndex].duration);
      pendingSeekRef.current = restored.currentTime;
      const audio = audioRef.current;
      const track = restored.queue[restored.queueIndex];
      if (audio && track.streamUrl) audio.src = track.streamUrl;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [library]);

  useEffect(() => {
    if (!library || !playerStateRestoredRef.current || !queue.length || !currentTrack) return;
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(PLAYER_STATE_KEY, encodePlayerState({
        queueIds: queue.map((track) => track.id),
        currentTrackId: currentTrack.id,
        playbackStackIds: playbackStack.map((track) => track.id),
        currentTime,
        shuffleEnabled,
        repeatMode,
      }));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [currentTime, currentTrack, library, playbackStack, queue, repeatMode, shuffleEnabled]);

  useEffect(() => {
    if (!library || !playerStateRestoredRef.current) return;
    const tracksById = new Map(library.tracks.map((track) => [track.id, track]));
    const timer = window.setTimeout(() => {
      setQueue((current) => current.map((track) => tracksById.get(track.id) ?? track));
      setPlaybackStack((current) => current.map((track) => tracksById.get(track.id) ?? track));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [library]);

  useEffect(() => {
    const candidates = [
      queue[queueIndex + 1],
      queue[queueIndex + 2],
      playbackStack.at(-1),
      repeatMode === "all" && queue.length === 1 ? playbackStack[0] : null,
    ];
    candidates.forEach((track) => { if (track) void primeTrackStream(track); });
  }, [playbackStack, queue, queueIndex, repeatMode]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshLibraryInBackground();
    };
    const interval = window.setInterval(refreshWhenVisible, 4000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshLibraryInBackground]);

  const activateTrack = useCallback((
    track: Track,
    autoplay = true,
    startAt = 0,
    reason: "play" | "next" | "previous" | "queue" = "play",
  ) => {
    const audio = audioRef.current;
    if (!audio || !track.streamUrl) return;
    window.clearTimeout(retryTimerRef.current);
    playbackRetryRef.current = { trackId: track.id, attempts: 0 };
    pendingSeekRef.current = startAt;
    if (audio.getAttribute("src") !== track.streamUrl) {
      audio.src = track.streamUrl;
    }
    try { audio.currentTime = startAt; } catch { /* Applied again after metadata loads. */ }
    setCurrentTime(startAt);
    setMediaDuration(track.duration);
    historyRecordedTrackRef.current = null;
    if (autoplay) {
      playIntentAtRef.current = performance.now();
      setBufferingMessage("Starting…");
      recordPlaybackEvent("play_request", track.id, { positionSeconds: startAt, detail: reason });
      setIsPlaying(true);
      void audio.play().catch(() => {
        setIsPlaying(false);
        setBufferingMessage(null);
        setToast({ kind: "error", message: "Tap play once more to start audio." });
      });
    }
  }, [recordPlaybackEvent]);

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
    const nextQueue = [...tracks.slice(safeIndex), ...tracks.slice(0, safeIndex)];
    setQueue(nextQueue);
    setQueueIndex(0);
    setPlaybackStack([]);
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

  const advanceTrack = useCallback((direction: 1 | -1, initiatedByUser = true) => {
    if (!queue.length) return;
    const activeTrack = queue[queueIndex];
    if (initiatedByUser && activeTrack) {
      recordPlaybackEvent("skip", activeTrack.id, {
        positionSeconds: audioRef.current?.currentTime ?? 0,
        detail: direction === 1 ? "next" : "back",
      });
    }
    if (direction === 1) {
      if (queue.length === 1) {
        if (repeatMode === "all") {
          const cycle = playbackStack.length ? [...playbackStack, queue[queueIndex]] : [queue[queueIndex]];
          setQueue(cycle);
          setQueueIndex(0);
          setPlaybackStack([]);
          activateTrack(cycle[0], true, 0, "next");
          haptic();
          return;
        }
        audioRef.current?.pause();
        setIsPlaying(false);
        return;
      }
      const oldTrack = queue[queueIndex];
      const nextIndexBeforeRemoval = (queueIndex + 1) % queue.length;
      const nextTrack = queue[nextIndexBeforeRemoval];
      const nextQueue = queue.filter((_, index) => index !== queueIndex);
      const nextIndex = nextQueue.findIndex((track) => track.id === nextTrack.id);
      setPlaybackStack((current) => [...current.slice(-49), oldTrack]);
      setQueue(nextQueue);
      setQueueIndex(Math.max(0, nextIndex));
      activateTrack(nextTrack, true, 0, "next");
      haptic();
      return;
    }
    const nextIndex = (queueIndex + direction + queue.length) % queue.length;
    setQueueIndex(nextIndex);
    activateTrack(queue[nextIndex], true, 0, "next");
    haptic();
  }, [activateTrack, playbackStack, queue, queueIndex, recordPlaybackEvent, repeatMode]);

  const previousTrack = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      setCurrentTime(0);
      return;
    }
    const previous = playbackStack.at(-1);
    if (!previous) {
      if (audio) {
        audio.currentTime = 0;
        setCurrentTime(0);
      }
      return;
    }
    const active = queue[queueIndex];
    if (active) recordPlaybackEvent("skip", active.id, { positionSeconds: audio?.currentTime ?? 0, detail: "previous" });
    const nextQueue = [previous, ...queue.filter((track) => track.id !== previous.id)];
    if (active && !nextQueue.some((track) => track.id === active.id)) nextQueue.push(active);
    setPlaybackStack((current) => current.slice(0, -1));
    setQueue(nextQueue);
    setQueueIndex(0);
    activateTrack(previous, true, 0, "previous");
    haptic();
  }, [activateTrack, playbackStack, queue, queueIndex, recordPlaybackEvent]);

  const selectQueueTrack = useCallback((index: number) => {
    if (index === queueIndex || index < 0 || index >= queue.length) return;
    const oldTrack = queue[queueIndex];
    const selected = queue[index];
    const nextQueue = queue.filter((_, itemIndex) => itemIndex !== queueIndex);
    const nextIndex = nextQueue.findIndex((track) => track.id === selected.id);
    setPlaybackStack((current) => [...current.slice(-49), oldTrack]);
    recordPlaybackEvent("skip", oldTrack.id, { positionSeconds: audioRef.current?.currentTime ?? 0, detail: "queue" });
    setQueue(nextQueue);
    setQueueIndex(Math.max(0, nextIndex));
    activateTrack(selected, true, 0, "queue");
    haptic();
  }, [activateTrack, queue, queueIndex, recordPlaybackEvent]);

  const togglePlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    if (audio.paused) {
      playIntentAtRef.current = performance.now();
      setBufferingMessage("Starting…");
      recordPlaybackEvent("play_request", currentTrack.id, { positionSeconds: audio.currentTime, detail: "resume" });
      void audio.play().catch(() => {
        setBufferingMessage(null);
        setToast({ kind: "error", message: "Audio could not start." });
      });
    } else {
      audio.pause();
    }
    haptic();
  }, [currentTrack, recordPlaybackEvent]);

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

  const cycleRepeatMode = useCallback(() => {
    const nextMode: RepeatMode = repeatMode === "off" ? "all" : repeatMode === "all" ? "one" : "off";
    setRepeatMode(nextMode);
    haptic();
    setToast({
      kind: "success",
      message: nextMode === "off" ? "Repeat off" : nextMode === "all" ? "Repeat all" : "Repeat song",
    });
  }, [repeatMode]);

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
    setPlaybackStack([]);
    setCurrentTime(0);
    setMediaDuration(0);
    setIsPlaying(false);
    setBufferingMessage(null);
    window.localStorage.removeItem(PLAYER_STATE_KEY);
    setQueueOpen(false);
    setPlayerOpen(false);
    haptic();
    setToast({ kind: "success", message: "Queue cleared" });
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        setSelectionMode(false);
        setSelectedTrackIds([]);
        setBulkPlaylistOpen(false);
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
      if (typing) return;
      if (input?.type === "range" && input.getAttribute("aria-label") === "Volume") return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if ((event.code === "Space" || event.key === " ") && currentTrack) {
        if (target?.closest("button, a, [role='button']")) return;
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
      await openShareFlow(result.url, `Listen to ${playlist.name}, a playlist by ${library?.user.displayName ?? "a tune user"}.`);
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
      const result = await api<{ created: boolean; possibleDuplicate: { title: string; artist: string } | null }>(`/api/shared/s_${sharedPreview.shareId}`, { method: "POST" });
      await loadLibrary();
      setSharedPreview(null);
      haptic("success");
      setToast({
        kind: "success",
        message: result.created
          ? result.possibleDuplicate
            ? `Song added. It may duplicate “${result.possibleDuplicate.title}” by ${result.possibleDuplicate.artist}.`
            : "Song added to your library"
          : "Song is already in your library",
      });
    } catch (mutationError) {
      setToast({ kind: "error", message: mutationError instanceof Error ? mutationError.message : "Could not add shared song." });
    } finally {
      setMutating(false);
    }
  }

  function openSharedSong() {
    if (!library || sharedPreview?.type !== "song" || !sharedPreview.libraryTrackId) return;
    const index = library.tracks.findIndex((track) => track.id === sharedPreview.libraryTrackId);
    if (index < 0) return;
    setSharedPreview(null);
    startInAppQueue(library.tracks, false, index);
    setPlayerOpen(true);
  }

  async function addSharedPlaylist() {
    if (!sharedPreview || sharedPreview.type !== "playlist") return;
    setMutating(true);
    try {
      const result = await api<{ playlistId: string; created: boolean; addedTracks: number }>(`/api/shared/p_${sharedPreview.shareId}`, { method: "POST" });
      await loadLibrary();
      setSharedPreview(null);
      setSelectedPlaylistId(result.playlistId);
      setTab("playlists");
      haptic("success");
      setToast({
        kind: "success",
        message: result.created ? `Playlist added with ${result.addedTracks} songs` : "Playlist is already in your library",
      });
    } catch (mutationError) {
      setToast({ kind: "error", message: mutationError instanceof Error ? mutationError.message : "Could not add shared playlist." });
    } finally {
      setMutating(false);
    }
  }

  async function openSharedPlaylist(shareId: string) {
    setSharedLoading(true);
    try {
      setSharedPreview(await api<SharedPreview>(`/api/shared/p_${shareId}`));
    } catch (openError) {
      setToast({ kind: "error", message: openError instanceof Error ? openError.message : "Could not open playlist." });
    } finally {
      setSharedLoading(false);
    }
  }

  async function toggleSharedPlaylistFollow() {
    if (sharedPreview?.type !== "playlist") return;
    const nextFollowing = !sharedPreview.following;
    setMutating(true);
    try {
      await api(`/api/shared/p_${sharedPreview.shareId}/follow`, { method: nextFollowing ? "POST" : "DELETE" });
      setSharedPreview({
        ...sharedPreview,
        following: nextFollowing,
        followerCount: Math.max(0, sharedPreview.followerCount + (nextFollowing ? 1 : -1)),
      });
      await loadLibrary();
      haptic("success");
      setToast({ kind: "success", message: nextFollowing ? "Playlist followed" : "Playlist unfollowed" });
    } catch (followError) {
      setToast({ kind: "error", message: followError instanceof Error ? followError.message : "Could not update follow." });
    } finally {
      setMutating(false);
    }
  }

  async function joinSharedCollaboration() {
    if (sharedPreview?.type !== "playlist") return;
    setMutating(true);
    try {
      const result = await api<{ playlistId: string }>(`/api/shared/p_${sharedPreview.shareId}/collaborate`, { method: "POST" });
      await loadLibrary();
      setSharedPreview(null);
      setSelectedPlaylistId(result.playlistId);
      setTab("playlists");
      haptic("success");
      setToast({ kind: "success", message: "You joined the collaborative playlist" });
    } catch (joinError) {
      setToast({ kind: "error", message: joinError instanceof Error ? joinError.message : "Could not join collaboration." });
    } finally {
      setMutating(false);
    }
  }

  async function togglePlaylistCollaboration(playlist: Playlist) {
    setMutating(true);
    try {
      await api(`/api/playlists/${playlist.id}`, {
        method: "PATCH",
        body: JSON.stringify({ collaborative: !playlist.collaborative }),
      });
      await loadLibrary();
      haptic("success");
      setToast({ kind: "success", message: playlist.collaborative ? "Collaboration paused" : "Collaboration enabled" });
    } catch (collaborationError) {
      setToast({ kind: "error", message: collaborationError instanceof Error ? collaborationError.message : "Could not update collaboration." });
    } finally {
      setMutating(false);
    }
  }

  async function leavePlaylistCollaboration(playlist: Playlist) {
    setMutating(true);
    try {
      await api(`/api/playlists/${playlist.id}/collaborate`, { method: "DELETE" });
      await loadLibrary();
      setSelectedPlaylistId(null);
      haptic("success");
      setToast({ kind: "success", message: "You left the collaborative playlist" });
    } catch (leaveError) {
      setToast({ kind: "error", message: leaveError instanceof Error ? leaveError.message : "Could not leave collaboration." });
    } finally {
      setMutating(false);
    }
  }

  async function updateProfileDetails(details: { displayName: string; bio: string; customPhoto: string | null | "keep" }) {
    setMutating(true);
    try {
      await api("/api/profile", { method: "PATCH", body: JSON.stringify(details) });
      await loadLibrary();
      setProfileEditOpen(false);
      haptic("success");
      setToast({ kind: "success", message: "Profile updated" });
    } catch (profileError) {
      setToast({ kind: "error", message: profileError instanceof Error ? profileError.message : "Could not update profile." });
    } finally {
      setMutating(false);
    }
  }

  async function shareProfile() {
    setMutating(true);
    try {
      const result = await api<{ url: string }>("/api/profile/share", { method: "POST" });
      await openShareFlow(result.url, `See ${library?.user.displayName ?? "my"} public playlists on tune.`);
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      setToast({ kind: "error", message: shareError instanceof Error ? shareError.message : "Could not share profile." });
    } finally {
      setMutating(false);
    }
  }

  async function markActivityRead() {
    try {
      await api("/api/notifications", { method: "PATCH" });
      await loadLibrary();
    } catch (notificationError) {
      setToast({ kind: "error", message: notificationError instanceof Error ? notificationError.message : "Could not update notifications." });
    }
  }

  async function saveFolder(folder: PlaylistFolder | "new", name: string) {
    setMutating(true);
    try {
      await api(folder === "new" ? "/api/playlist-folders" : `/api/playlist-folders/${folder.id}`, {
        method: folder === "new" ? "POST" : "PATCH",
        body: JSON.stringify({ name }),
      });
      await loadLibrary();
      setFolderEditor(null);
      haptic("success");
      setToast({ kind: "success", message: folder === "new" ? "Folder created" : "Folder renamed" });
    } catch (folderError) {
      setToast({ kind: "error", message: folderError instanceof Error ? folderError.message : "Could not save folder." });
    } finally {
      setMutating(false);
    }
  }

  async function deleteFolder(folder: PlaylistFolder) {
    setMutating(true);
    try {
      await api(`/api/playlist-folders/${folder.id}`, { method: "DELETE" });
      await loadLibrary();
      setFolderEditor(null);
      haptic("success");
      setToast({ kind: "success", message: "Folder deleted; playlists moved to Unfiled" });
    } catch (folderError) {
      setToast({ kind: "error", message: folderError instanceof Error ? folderError.message : "Could not delete folder." });
    } finally {
      setMutating(false);
    }
  }

  async function movePlaylistToFolder(playlist: Playlist, folderId: string | null) {
    setMutating(true);
    try {
      await api(`/api/playlists/${playlist.id}`, { method: "PATCH", body: JSON.stringify({ folderId }) });
      await loadLibrary();
      haptic("success");
      setToast({ kind: "success", message: folderId ? "Playlist moved to folder" : "Playlist moved to Unfiled" });
    } catch (folderError) {
      setToast({ kind: "error", message: folderError instanceof Error ? folderError.message : "Could not move playlist." });
    } finally {
      setMutating(false);
    }
  }

  async function createPlaylist(name: string, description: string) {
    setMutating(true);
    try {
      const result = await api<{ id: string }>("/api/playlists", {
        method: "POST",
        body: JSON.stringify({
          name,
          description,
          trackIds: pendingPlaylistCreate?.trackIds,
          moveFromPlaylistId: pendingPlaylistCreate?.moveFromPlaylistId,
        }),
      });
      await loadLibrary();
      setCreateOpen(false);
      const organizedCount = pendingPlaylistCreate?.trackIds.length ?? 0;
      const moved = Boolean(pendingPlaylistCreate?.moveFromPlaylistId);
      setPendingPlaylistCreate(null);
      if (organizedCount) clearSelection();
      setSelectedPlaylistId(result.id);
      setTab("playlists");
      haptic("success");
      setToast({
        kind: "success",
        message: organizedCount
          ? moved
            ? `Playlist created and ${organizedCount} ${organizedCount === 1 ? "song" : "songs"} moved`
            : `Playlist created with ${organizedCount} ${organizedCount === 1 ? "song" : "songs"}`
          : "Playlist created",
      });
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

  function swipeTrackToLiked(track: Track) {
    if (!track.owned) {
      haptic();
      setToast({ kind: "success", message: "Save this song to your library before liking it" });
      return;
    }
    if (track.liked) {
      haptic();
      setToast({ kind: "success", message: "Already in Liked Songs" });
      return;
    }
    void toggleTrackLiked(track);
  }

  function clearSelection() {
    setSelectionMode(false);
    setSelectedTrackIds([]);
    setBulkPlaylistOpen(false);
  }

  function toggleTrackSelection(trackId: string) {
    haptic();
    setSelectedTrackIds((current) => current.includes(trackId)
      ? current.filter((id) => id !== trackId)
      : [...current, trackId]);
  }

  function requestHomeScreen() {
    const webApp = window.Telegram?.WebApp;
    if (!webApp?.addToHomeScreen) {
      setToast({ kind: "error", message: "Update Telegram to add this Mini App to your Home Screen." });
      return;
    }
    haptic();
    webApp.addToHomeScreen();
  }

  async function updatePlaylistDetails(
    playlist: Playlist,
    details: { name: string; description: string; coverSeed: number | null; coverImage: string | null },
  ) {
    setMutating(true);
    try {
      const updated = await api<{
        name: string;
        description: string;
        coverSeed: number | null;
        coverImage: string | null;
      }>(`/api/playlists/${playlist.id}`, {
        method: "PATCH",
        body: JSON.stringify(details),
      });
      setLibrary((current) => current ? {
        ...current,
        playlists: current.playlists.map((item) => item.id === playlist.id
          ? {
            ...item,
            name: updated.name,
            description: updated.description,
            coverSeed: updated.coverSeed,
            coverImage: updated.coverImage,
          }
          : item),
      } : current);
      setEditPlaylistTarget(null);
      haptic("success");
      setToast({ kind: "success", message: "Playlist updated" });
      void refreshLibraryInBackground();
    } catch (mutationError) {
      haptic("error");
      setToast({ kind: "error", message: mutationError instanceof Error ? mutationError.message : "Could not update playlist." });
    } finally {
      setMutating(false);
    }
  }

  async function saveTrackToLibrary(track: Track) {
    setMutating(true);
    try {
      const result = await api<{ created: boolean; trackId: string }>(`/api/tracks/${track.id}/save`, { method: "POST" });
      await loadLibrary();
      setTrackMenu(null);
      haptic("success");
      setToast({ kind: "success", message: result.created ? "Song saved to My Library" : "Song is already in My Library" });
    } catch (saveError) {
      haptic("error");
      setToast({ kind: "error", message: saveError instanceof Error ? saveError.message : "Could not save song." });
    } finally {
      setMutating(false);
    }
  }

  async function updateTrackMetadata(
    track: Track,
    details: { title: string; artist: string; customArtwork: string | null | "keep" },
  ) {
    setMutating(true);
    try {
      await api(`/api/tracks/${track.id}`, {
        method: "PATCH",
        body: JSON.stringify(details),
      });
      await loadLibrary();
      setEditTrackTarget(null);
      setTrackMenu(null);
      haptic("success");
      setToast({ kind: "success", message: "Song details updated" });
    } catch (mutationError) {
      haptic("error");
      setToast({ kind: "error", message: mutationError instanceof Error ? mutationError.message : "Could not update song details." });
    } finally {
      setMutating(false);
    }
  }

  async function setSelectedLiked(liked: boolean) {
    if (!selectedTrackIds.length) return;
    setMutating(true);
    try {
      await api("/api/tracks/like", {
        method: "PUT",
        body: JSON.stringify({ trackIds: selectedTrackIds, liked }),
      });
      const selected = new Set(selectedTrackIds);
      setQueue((current) => current.map((track) => selected.has(track.id) ? { ...track, liked } : track));
      await loadLibrary();
      clearSelection();
      haptic("success");
      setToast({ kind: "success", message: liked ? "Added to Liked Songs" : "Removed from Liked Songs" });
    } catch (mutationError) {
      haptic("error");
      setToast({ kind: "error", message: mutationError instanceof Error ? mutationError.message : "Could not update Liked Songs." });
    } finally {
      setMutating(false);
    }
  }

  async function shareSelectedTracks() {
    if (!selectedTracks.length) return;
    if (selectedTracks.length > 10) {
      setToast({ kind: "error", message: "Choose up to 10 songs to share at once." });
      return;
    }
    setMutating(true);
    try {
      const result = await api<{ urls: string[] }>("/api/tracks/share", {
        method: "POST",
        body: JSON.stringify({ trackIds: selectedTracks.map((track) => track.id) }),
      });
      const [firstUrl, ...otherUrls] = result.urls;
      const trackList = selectedTracks.map((track) => `${track.title} — ${track.artist}`).join("\n");
      const extraLinks = otherUrls.length ? `\n\n${otherUrls.join("\n")}` : "";
      await openShareFlow(firstUrl, `Music from tune:\n${trackList}${extraLinks}`);
      clearSelection();
      haptic("success");
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      haptic("error");
      setToast({ kind: "error", message: shareError instanceof Error ? shareError.message : "Could not share songs." });
    } finally {
      setMutating(false);
    }
  }

  async function organizeSelectedTracks(targetPlaylistId: string, move: boolean) {
    if (!selectedTrackIds.length) return;
    setMutating(true);
    try {
      const result = await api<{ added: number }>(`/api/playlists/${targetPlaylistId}/tracks`, {
        method: "POST",
        body: JSON.stringify({ trackIds: selectedTrackIds }),
      });
      if (move && selectedPlaylist?.kind === "standard" && selectedPlaylist.id !== targetPlaylistId) {
        await api(`/api/playlists/${selectedPlaylist.id}/tracks`, {
          method: "DELETE",
          body: JSON.stringify({ trackIds: selectedTrackIds }),
        });
      }
      await loadLibrary();
      clearSelection();
      haptic("success");
      setToast({
        kind: "success",
        message: move ? "Songs moved to playlist" : result.added ? "Songs added to playlist" : "Songs were already in that playlist",
      });
    } catch (mutationError) {
      haptic("error");
      setToast({ kind: "error", message: mutationError instanceof Error ? mutationError.message : "Could not organize songs." });
    } finally {
      setMutating(false);
    }
  }

  async function removeSelectedFromPlaylist() {
    if (!selectedTrackIds.length || selectedPlaylist?.kind !== "standard") return;
    setMutating(true);
    try {
      await api(`/api/playlists/${selectedPlaylist.id}/tracks`, {
        method: "DELETE",
        body: JSON.stringify({ trackIds: selectedTrackIds }),
      });
      await loadLibrary();
      clearSelection();
      haptic("success");
      setToast({ kind: "success", message: "Songs removed from playlist" });
    } catch (mutationError) {
      haptic("error");
      setToast({ kind: "error", message: mutationError instanceof Error ? mutationError.message : "Could not remove songs." });
    } finally {
      setMutating(false);
    }
  }

  async function deleteLibraryTracks(tracks: Track[]) {
    const trackIds = tracks.map((track) => track.id);
    if (!trackIds.length) return;
    setMutating(true);
    try {
      await api("/api/tracks", {
        method: "DELETE",
        body: JSON.stringify({ trackIds }),
      });
      const deleted = new Set(trackIds);
      const nextQueue = queue.filter((track) => !deleted.has(track.id));
      if (currentTrack && deleted.has(currentTrack.id)) {
        if (nextQueue.length) {
          const nextIndex = Math.min(queueIndex, nextQueue.length - 1);
          setQueue(nextQueue);
          setQueueIndex(nextIndex);
          activateTrack(nextQueue[nextIndex], isPlaying);
        } else {
          const audio = audioRef.current;
          audio?.pause();
          audio?.removeAttribute("src");
          audio?.load();
          setQueue([]);
          setQueueIndex(0);
          setCurrentTime(0);
          setMediaDuration(0);
          setIsPlaying(false);
          setQueueOpen(false);
          setPlayerOpen(false);
          window.localStorage.removeItem(PLAYER_STATE_KEY);
          if ("mediaSession" in navigator) navigator.mediaSession.metadata = null;
        }
      } else {
        setQueue(nextQueue);
        if (currentTrack) setQueueIndex(Math.max(0, nextQueue.findIndex((track) => track.id === currentTrack.id)));
      }
      await loadLibrary();
      setDeleteTrackTargets([]);
      setTrackMenu(null);
      clearSelection();
      haptic("success");
      setToast({ kind: "success", message: tracks.length === 1 ? "Song removed from My Library" : `${tracks.length} songs removed from My Library` });
    } catch (mutationError) {
      haptic("error");
      setToast({ kind: "error", message: mutationError instanceof Error ? mutationError.message : "Could not remove songs from your library." });
    } finally {
      setMutating(false);
    }
  }

  async function submitBugReport(description: string) {
    setMutating(true);
    try {
      const webApp = window.Telegram?.WebApp;
      await api("/api/bug-reports", {
        method: "POST",
        body: JSON.stringify({
          description,
          context: {
            platform: webApp?.platform ?? "web",
            telegramVersion: webApp?.version ?? "unknown",
            colorScheme: effectiveTheme,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            userAgent: navigator.userAgent,
          },
        }),
      });
      setBugReportOpen(false);
      haptic("success");
      setToast({ kind: "success", message: "Bug report sent. Thank you." });
    } catch (mutationError) {
      haptic("error");
      setToast({ kind: "error", message: mutationError instanceof Error ? mutationError.message : "Could not send the bug report." });
    } finally {
      setMutating(false);
    }
  }

  function switchTab(next: Tab) {
    haptic();
    clearSelection();
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

  function handlePlaybackError() {
    const audio = audioRef.current;
    const track = currentTrackRef.current;
    if (!audio?.getAttribute("src") || !track?.streamUrl) return;
    const position = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const previous = playbackRetryRef.current.trackId === track.id
      ? playbackRetryRef.current.attempts
      : 0;
    recordPlaybackEvent("stream_error", track.id, {
      positionSeconds: position,
      detail: navigator.onLine ? `media-${audio.error?.code ?? "unknown"}` : "offline",
    });
    if (navigator.onLine && previous < 2) {
      const attempts = previous + 1;
      playbackRetryRef.current = { trackId: track.id, attempts };
      pendingSeekRef.current = position;
      setBufferingMessage(attempts === 1 ? "Reconnecting…" : "Retrying stream…");
      recordPlaybackEvent("retry_started", track.id, { positionSeconds: position, detail: String(attempts) });
      retryTimerRef.current = window.setTimeout(() => {
        if (currentTrackRef.current?.id !== track.id || !audioRef.current) return;
        const separator = track.streamUrl!.includes("?") ? "&" : "?";
        audioRef.current.src = `${track.streamUrl}${separator}retry=${Date.now()}`;
        playIntentAtRef.current = performance.now();
        void audioRef.current.play().catch(() => { /* The media error handler reports the final result. */ });
      }, attempts === 1 ? 250 : 750);
      return;
    }
    setIsPlaying(false);
    setBufferingMessage(null);
    setToast({
      kind: "error",
      message: navigator.onLine
        ? "This track could not be streamed after two retries."
        : "You appear to be offline. Reconnect and press play again.",
    });
  }

  useEffect(() => () => window.clearTimeout(retryTimerRef.current), []);

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
    <div className={`app-frame ${currentTrack ? "has-player" : ""} ${selectionMode ? "selection-active" : ""}`}>
      <audio
        ref={audioRef}
        preload="auto"
        onPlay={() => setIsPlaying(true)}
        onPlaying={(event) => {
          const track = currentTrackRef.current;
          const startupMs = playIntentAtRef.current === null ? null : Math.round(performance.now() - playIntentAtRef.current);
          if (track && startupMs !== null) {
            recordPlaybackEvent("playback_started", track.id, { startupMs, positionSeconds: event.currentTarget.currentTime });
          }
          if (track && playbackRetryRef.current.trackId === track.id && playbackRetryRef.current.attempts > 0) {
            recordPlaybackEvent("retry_recovered", track.id, {
              startupMs: startupMs ?? undefined,
              positionSeconds: event.currentTarget.currentTime,
              detail: String(playbackRetryRef.current.attempts),
            });
          }
          playIntentAtRef.current = null;
          waitingAtRef.current = null;
          playbackRetryRef.current = { trackId: track?.id ?? "", attempts: 0 };
          setBufferingMessage(null);
          setIsPlaying(true);
        }}
        onPause={() => {
          if (!audioRef.current?.ended) setIsPlaying(false);
        }}
        onLoadedMetadata={(event) => {
          const duration = Number.isFinite(event.currentTarget.duration)
            ? event.currentTarget.duration
            : currentTrack?.duration ?? 0;
          setMediaDuration(duration);
          if (pendingSeekRef.current !== null) {
            const seek = Math.min(pendingSeekRef.current, Math.max(0, duration - 0.25));
            try { event.currentTarget.currentTime = seek; } catch { /* Some media engines defer seeking. */ }
            setCurrentTime(seek);
            pendingSeekRef.current = null;
          }
        }}
        onWaiting={(event) => {
          setBufferingMessage(playIntentAtRef.current === null ? "Buffering…" : "Starting…");
          if (playIntentAtRef.current === null && waitingAtRef.current === null && currentTrackRef.current) {
            waitingAtRef.current = performance.now();
            recordPlaybackEvent("buffer_start", currentTrackRef.current.id, { positionSeconds: event.currentTarget.currentTime });
          }
        }}
        onCanPlay={(event) => {
          if (waitingAtRef.current !== null && currentTrackRef.current) {
            recordPlaybackEvent("buffer_end", currentTrackRef.current.id, {
              startupMs: Math.round(performance.now() - waitingAtRef.current),
              positionSeconds: event.currentTarget.currentTime,
            });
            waitingAtRef.current = null;
          }
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
          if (repeatMode === "one" && audioRef.current) {
            audioRef.current.currentTime = 0;
            void audioRef.current.play();
          } else {
            advanceTrack(1, false);
          }
        }}
        onError={handlePlaybackError}
      />
      {!library ? <Skeleton /> : (
        <>
          {tab === "home" ? (
            <HomeScreen
              library={library}
              themeMode={themeMode}
              effectiveTheme={effectiveTheme}
              onThemeChange={cycleTheme}
              onReportBug={() => setBugReportOpen(true)}
              canAddHomeScreen={canAddHomeScreen}
              onAddHomeScreen={requestHomeScreen}
              onProfile={() => switchTab("profile")}
              onSeeHistory={() => setHistoryOpen(true)}
              onPlay={(track) => startInAppQueue(
                library.tracks,
                false,
                library.tracks.findIndex((item) => item.id === track.id),
              )}
              onMore={setTrackMenu}
              onSwipeQueue={playTrackNext}
              onSwipeLike={swipeTrackToLiked}
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
              onSwipeQueue={playTrackNext}
              onSwipeLike={swipeTrackToLiked}
              onShuffle={() => startInAppQueue(library.tracks, true)}
              sending={sending}
              selecting={selectionMode}
              selectedIds={selectedTrackIds}
              onStartSelecting={() => setSelectionMode(true)}
              onCancelSelecting={clearSelection}
              onSelect={toggleTrackSelection}
              onSelectAll={() => setSelectedTrackIds(filteredTracks.map((track) => track.id))}
            />
          ) : null}
          {tab === "playlists" && !selectedPlaylist ? (
            <PlaylistsScreen
              playlists={library.playlists}
              folders={library.playlistFolders}
              followedPlaylists={library.followedPlaylists}
              onOpen={setSelectedPlaylistId}
              onCreate={() => { setPendingPlaylistCreate(null); setCreateOpen(true); }}
              onCreateFolder={() => setFolderEditor("new")}
              onEditFolder={setFolderEditor}
              onOpenFollowed={(shareId) => void openSharedPlaylist(shareId)}
            />
          ) : null}
          {tab === "playlists" && selectedPlaylist ? (
            <PlaylistDetail
              playlist={selectedPlaylist}
              onBack={() => { clearSelection(); setSelectedPlaylistId(null); }}
              onPlay={() => startInAppQueue(selectedPlaylist.tracks)}
              onShuffle={() => startInAppQueue(selectedPlaylist.tracks, true)}
              onTrackPlay={(track) => startInAppQueue(
                selectedPlaylist.tracks,
                false,
                selectedPlaylist.tracks.findIndex((item) => item.id === track.id),
              )}
              onMore={setTrackMenu}
              onSwipeQueue={playTrackNext}
              onSwipeLike={swipeTrackToLiked}
              onAddMusic={() => setAddMusicPlaylistId(selectedPlaylist.id)}
              onEdit={() => setEditPlaylistTarget(selectedPlaylist)}
              onDelete={() => setDeletePlaylistTarget(selectedPlaylist)}
              onVisibility={() => void updatePlaylistVisibility(selectedPlaylist)}
              onShare={() => void sharePlaylist(selectedPlaylist)}
              folders={library.playlistFolders}
              onFolder={(folderId) => void movePlaylistToFolder(selectedPlaylist, folderId)}
              onCollaboration={() => void togglePlaylistCollaboration(selectedPlaylist)}
              onLeave={() => void leavePlaylistCollaboration(selectedPlaylist)}
              busy={sending || mutating}
              selecting={selectionMode}
              selectedIds={selectedTrackIds}
              onStartSelecting={() => setSelectionMode(true)}
              onCancelSelecting={clearSelection}
              onSelect={toggleTrackSelection}
              onSelectAll={() => setSelectedTrackIds(selectedPlaylist.tracks.map((track) => track.id))}
            />
          ) : null}
          {tab === "profile" ? (
            <ProfileScreen
              library={library}
              onEdit={() => setProfileEditOpen(true)}
              onShare={() => void shareProfile()}
              onOpenPlaylist={(id) => { setSelectedPlaylistId(id); setTab("playlists"); }}
              onMarkRead={() => void markActivityRead()}
            />
          ) : null}

          {selectionMode ? (
            <SelectionToolbar
              tracks={selectedTracks}
              currentPlaylist={selectedPlaylist}
              busy={mutating || sending}
              onClose={clearSelection}
              onOrganize={() => setBulkPlaylistOpen(true)}
              onLike={() => void setSelectedLiked(!selectedTracks.every((track) => track.liked))}
              onShare={() => void shareSelectedTracks()}
              onSend={() => void sendQueue(selectedTrackIds)}
              onRemove={selectedPlaylist?.kind === "standard" ? () => void removeSelectedFromPlaylist() : undefined}
              onDelete={() => setDeleteTrackTargets(selectedTracks)}
            />
          ) : null}
          <BottomNav tab={tab} onSelect={switchTab} unreadNotifications={library.unreadNotifications} />
          {currentTrack ? (
            <MiniPlayer
              track={currentTrack}
              isPlaying={isPlaying}
              bufferingMessage={bufferingMessage}
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
          onClose={() => { setCreateOpen(false); setPendingPlaylistCreate(null); }}
          onCreate={(name, description) => void createPlaylist(name, description)}
        />
      ) : null}
      {editPlaylistTarget ? (
        <EditPlaylistSheet
          playlist={editPlaylistTarget}
          busy={mutating}
          onClose={() => setEditPlaylistTarget(null)}
          onSave={(details) => void updatePlaylistDetails(editPlaylistTarget, details)}
        />
      ) : null}
      {profileEditOpen && library ? (
        <ProfileEditSheet
          library={library}
          busy={mutating}
          onClose={() => setProfileEditOpen(false)}
          onSave={(details) => void updateProfileDetails(details)}
        />
      ) : null}
      {folderEditor ? (
        <PlaylistFolderSheet
          folder={folderEditor}
          busy={mutating}
          onClose={() => setFolderEditor(null)}
          onSave={(name) => void saveFolder(folderEditor, name)}
          onDelete={folderEditor === "new" ? undefined : () => void deleteFolder(folderEditor)}
        />
      ) : null}
      {editTrackTarget ? (
        <EditTrackSheet
          track={editTrackTarget}
          busy={mutating}
          onClose={() => setEditTrackTarget(null)}
          onSave={(details) => void updateTrackMetadata(editTrackTarget, details)}
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
      {bulkPlaylistOpen && library ? (
        <BulkPlaylistSheet
          tracks={selectedTracks}
          playlists={library.playlists.filter((playlist) => playlist.kind === "standard")}
          currentPlaylist={selectedPlaylist?.kind === "standard" ? selectedPlaylist : null}
          busy={mutating}
          onClose={() => setBulkPlaylistOpen(false)}
          onApply={(playlistId, move) => void organizeSelectedTracks(playlistId, move)}
          onCreate={(move) => {
            setPendingPlaylistCreate({
              trackIds: [...selectedTrackIds],
              moveFromPlaylistId: move && selectedPlaylist?.kind === "standard"
                ? selectedPlaylist.id
                : undefined,
            });
            setBulkPlaylistOpen(false);
            setCreateOpen(true);
          }}
        />
      ) : null}
      {deleteTrackTargets.length ? (
        <DeleteTracksSheet
          tracks={deleteTrackTargets}
          busy={mutating}
          onClose={() => setDeleteTrackTargets([])}
          onDelete={() => void deleteLibraryTracks(deleteTrackTargets)}
        />
      ) : null}
      {bugReportOpen ? (
        <BugReportSheet
          busy={mutating}
          onClose={() => setBugReportOpen(false)}
          onSubmit={(description) => void submitBugReport(description)}
        />
      ) : null}
      {queueOpen && currentTrack ? (
        <QueueSheet
          queue={queue}
          queueIndex={queueIndex}
          onClose={() => setQueueOpen(false)}
          onPlay={(index) => {
            selectQueueTrack(index);
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
          onSwipeQueue={playTrackNext}
          onSwipeLike={swipeTrackToLiked}
        />
      ) : null}
      {sharedPreview ? (
        <SharedItemSheet
          preview={sharedPreview}
          busy={mutating}
          onClose={() => setSharedPreview(null)}
          onAddSong={() => void addSharedSong()}
          onOpenSong={openSharedSong}
          onAddPlaylist={() => void addSharedPlaylist()}
          onOpenPlaylist={(shareId) => void openSharedPlaylist(shareId)}
          onToggleFollow={() => void toggleSharedPlaylistFollow()}
          onCollaborate={() => void joinSharedCollaboration()}
        />
      ) : null}
      {trackMenu && library ? (
        <TrackSheet
          track={trackMenu}
          playlists={library.playlists}
          busy={mutating || sending}
          onClose={() => setTrackMenu(null)}
          onPlayNow={() => {
            setTrackMenu(null);
            startInAppQueue([trackMenu]);
          }}
          onSendTelegram={() => { setTrackMenu(null); void sendQueue([trackMenu.id]); }}
          onPlayNext={() => playTrackNext(trackMenu)}
          onToggleLiked={() => void toggleTrackLiked(trackMenu)}
          onSaveLibrary={() => void saveTrackToLibrary(trackMenu)}
          onEdit={() => { setEditTrackTarget(trackMenu); setTrackMenu(null); }}
          onShare={() => void shareTrack(trackMenu)}
          onAdd={addToPlaylist}
          onRemove={selectedPlaylist && selectedPlaylist.kind === "standard"
            ? () => void removeFromPlaylist(selectedPlaylist.id, trackMenu.id)
            : undefined}
          onRemoveLibrary={() => { setTrackMenu(null); setDeleteTrackTargets([trackMenu]); }}
          onNewPlaylist={() => { setTrackMenu(null); setPendingPlaylistCreate(null); setCreateOpen(true); }}
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
          repeatMode={repeatMode}
          volume={volume}
          muted={muted}
          bufferingMessage={bufferingMessage}
          onClose={() => setPlayerOpen(false)}
          onToggle={togglePlayback}
          onPrevious={previousTrack}
          onNext={() => advanceTrack(1)}
          onSeek={seekTo}
          onShuffle={toggleShuffle}
          onRepeat={cycleRepeatMode}
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
  onReportBug,
  canAddHomeScreen,
  onAddHomeScreen,
  onProfile,
  subtitle = "Your music, right here.",
}: {
  name: string;
  photoUrl: string | null;
  themeMode: ThemeMode;
  effectiveTheme: ResolvedTheme;
  onThemeChange: () => void;
  onReportBug: () => void;
  canAddHomeScreen: boolean;
  onAddHomeScreen: () => void;
  onProfile: () => void;
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
        <button className="theme-toggle" onClick={onReportBug} aria-label="Report a bug" title="Report a bug">
          <Bug />
        </button>
        {canAddHomeScreen ? (
          <button className="theme-toggle" onClick={onAddHomeScreen} aria-label="Add tune to Home Screen" title="Add to Home Screen">
            <Plus />
          </button>
        ) : null}
        <button className="theme-toggle" onClick={onThemeChange} aria-label={`Theme: ${themeLabel}. Change theme`} title={`Theme: ${themeLabel}`}>
          <ThemeIcon />
        </button>
        <button className="avatar" onClick={onProfile} aria-label={`Open ${name}'s profile`}>
          <UserAvatar name={name} photoUrl={photoUrl} />
        </button>
      </div>
    </header>
  );
}

function HomeScreen({
  library,
  themeMode,
  effectiveTheme,
  onThemeChange,
  onReportBug,
  canAddHomeScreen,
  onAddHomeScreen,
  onProfile,
  onSeeHistory,
  onPlay,
  onMore,
  onSwipeQueue,
  onSwipeLike,
  onPlaylist,
  onSeeLibrary,
  onShuffle,
  sending,
}: {
  library: LibraryPayload;
  themeMode: ThemeMode;
  effectiveTheme: ResolvedTheme;
  onThemeChange: () => void;
  onReportBug: () => void;
  canAddHomeScreen: boolean;
  onAddHomeScreen: () => void;
  onProfile: () => void;
  onSeeHistory: () => void;
  onPlay: (track: Track) => void;
  onMore: (track: Track) => void;
  onSwipeQueue: (track: Track) => void;
  onSwipeLike: (track: Track) => void;
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
        name={library.user.displayName}
        photoUrl={library.user.photoUrl}
        themeMode={themeMode}
        effectiveTheme={effectiveTheme}
        onThemeChange={onThemeChange}
        onReportBug={onReportBug}
        canAddHomeScreen={canAddHomeScreen}
        onAddHomeScreen={onAddHomeScreen}
        onProfile={onProfile}
      />

      <section className="welcome-block">
        <p className="eyebrow">Good evening, {library.user.displayName}</p>
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
            <p>{featured.description || `${formatSongCount(featured.trackCount)} from your library`}</p>
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
          <TrackRow key={track.id} track={track} onPlay={() => onPlay(track)} onMore={() => onMore(track)} onSwipeQueue={() => onSwipeQueue(track)} onSwipeLike={() => onSwipeLike(track)} />
        )) : <EmptyState title="Your music inbox is empty" copy="Send or forward an audio track to the bot and it will appear here." />}
      </section>

      {library.recentlyPlayed.length ? (
        <section className="section-block">
          <div className="section-heading">
            <div><p className="eyebrow">Listen again</p><h2>Recently played</h2></div>
            <button onClick={onSeeHistory}>See all <ChevronRight /></button>
          </div>
          {library.recentlyPlayed.slice(0, 4).map((track) => (
            <TrackRow key={track.id} track={track} onPlay={() => onPlay(track)} onMore={() => onMore(track)} onSwipeQueue={() => onSwipeQueue(track)} onSwipeLike={() => onSwipeLike(track)} />
          ))}
        </section>
      ) : null}

      {library.recommendations.length ? (
        <section className="section-block recommendation-block">
          <div className="section-heading">
            <div><p className="eyebrow">Only from your collection</p><h2>Recommended for you</h2></div>
          </div>
          <p className="recommendation-note">Based on your Liked Songs and listening history. Nothing outside your library is suggested.</p>
          {library.recommendations.slice(0, 4).map((track) => (
            <TrackRow key={track.id} track={track} onPlay={() => onPlay(track)} onMore={() => onMore(track)} onSwipeQueue={() => onSwipeQueue(track)} onSwipeLike={() => onSwipeLike(track)} />
          ))}
        </section>
      ) : null}

      <div className="telegram-note">
        <span><Send /></span>
        <div><strong>Streamed from Telegram</strong><p>Send Music/Audio up to 10 minutes and 20 MB. Your audio stays on Telegram while tune streams it.</p></div>
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
  onSwipeQueue,
  onSwipeLike,
  onShuffle,
  sending,
  selecting,
  selectedIds,
  onStartSelecting,
  onCancelSelecting,
  onSelect,
  onSelectAll,
}: {
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  tracks: Track[];
  total: number;
  search: string;
  setSearch: (value: string) => void;
  onPlay: (track: Track) => void;
  onMore: (track: Track) => void;
  onSwipeQueue: (track: Track) => void;
  onSwipeLike: (track: Track) => void;
  onShuffle: () => void;
  sending: boolean;
  selecting: boolean;
  selectedIds: string[];
  onStartSelecting: () => void;
  onCancelSelecting: () => void;
  onSelect: (trackId: string) => void;
  onSelectAll: () => void;
}) {
  return (
    <main className="screen library-screen">
      <div className="page-heading">
        <div><p className="eyebrow">Your collection</p><h1>Library</h1></div>
        <div className="page-heading-actions">
          <button className="text-action" onClick={selecting ? onCancelSelecting : onStartSelecting} disabled={!total}>
            {selecting ? "Done" : "Select"}
          </button>
          <button className="round-action" onClick={onShuffle} disabled={sending || !total || selecting} aria-label="Shuffle library"><Shuffle /></button>
        </div>
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
      <div className="list-meta">
        <span>{search ? `${tracks.length} found` : formatSongCount(total)}</span>
        {selecting ? <button className="text-action" onClick={onSelectAll} disabled={!tracks.length}>Select all</button> : <span>Recently added</span>}
      </div>
      <div className="track-list">
        {tracks.length ? tracks.map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            onPlay={() => onPlay(track)}
            onMore={() => onMore(track)}
            onSwipeQueue={() => onSwipeQueue(track)}
            onSwipeLike={() => onSwipeLike(track)}
            selecting={selecting}
            selected={selectedIds.includes(track.id)}
            onSelect={() => onSelect(track.id)}
          />
        )) : (
          <EmptyState title={search ? "Nothing found" : "No songs yet"} copy={search ? "Try a different song or artist." : "Send an audio file to the bot to start your library."} />
        )}
      </div>
    </main>
  );
}

function PlaylistsScreen({
  playlists,
  folders,
  followedPlaylists,
  onOpen,
  onCreate,
  onCreateFolder,
  onEditFolder,
  onOpenFollowed,
}: {
  playlists: Playlist[];
  folders: PlaylistFolder[];
  followedPlaylists: LibraryPayload["followedPlaylists"];
  onOpen: (id: string) => void;
  onCreate: () => void;
  onCreateFolder: () => void;
  onEditFolder: (folder: PlaylistFolder) => void;
  onOpenFollowed: (shareId: string) => void;
}) {
  const visibleFollowedPlaylists = followedPlaylists.filter((followed) =>
    !playlists.some((playlist) => playlist.id === followed.playlistId));
  return (
    <main className="screen playlists-screen">
      <div className="page-heading">
        <div><p className="eyebrow">Made by you</p><h1>Playlists</h1></div>
        <div className="page-heading-actions">
          <button className="round-action" onClick={onCreateFolder} aria-label="Create playlist folder"><FolderPlus /></button>
          <button className="round-action" onClick={onCreate} aria-label="Create playlist"><Plus /></button>
        </div>
      </div>
      {folders.length ? (
        <section className="playlist-folder-strip" aria-label="Playlist folders">
          {folders.map((folder) => (
            <button key={folder.id} onClick={() => onEditFolder(folder)}>
              <Folder />
              <span><strong>{folder.name}</strong><small>{formatPlaylistCount(playlists.filter((playlist) => playlist.folderId === folder.id).length)}</small></span>
              <Pencil />
            </button>
          ))}
        </section>
      ) : null}
      {playlists.length ? (
        <div className="playlist-grid">
          {playlists.map((playlist) => (
            <button className="playlist-card" key={playlist.id} onClick={() => onOpen(playlist.id)}>
              <PlaylistCover playlist={playlist} />
              <span className="playlist-card-title">{playlist.name}</span>
              {playlist.access === "collaborator" ? <span className="playlist-card-badge"><Users /> With {playlist.ownerName}</span> : null}
              {playlist.folderId ? <span className="playlist-card-badge"><Folder /> {folders.find((folder) => folder.id === playlist.folderId)?.name}</span> : null}
              <span className="playlist-card-meta">{formatSongCount(playlist.trackCount)} · {formatCollectionDuration(playlist.duration)}</span>
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
      {visibleFollowedPlaylists.length ? (
        <section className="followed-playlists-section">
          <div className="section-heading"><div><p className="eyebrow">Saved for later</p><h2>Following</h2></div></div>
          <div className="playlist-grid">
            {visibleFollowedPlaylists.map((playlist) => (
              <button className="playlist-card" key={playlist.shareId} onClick={() => onOpenFollowed(playlist.shareId)}>
                <PlaylistCover playlist={playlist} />
                <span className="playlist-card-title">{playlist.name}</span>
                <span className="playlist-card-meta">By {playlist.ownerName}</span>
                <span className="playlist-card-badge"><UserPlus /> Following</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function ProfileScreen({
  library,
  onEdit,
  onShare,
  onOpenPlaylist,
  onMarkRead,
}: {
  library: LibraryPayload;
  onEdit: () => void;
  onShare: () => void;
  onOpenPlaylist: (id: string) => void;
  onMarkRead: () => void;
}) {
  const displayName = library.user.displayName;
  const publicPlaylists = library.playlists.filter((playlist) => playlist.access === "owner" && playlist.visibility === "public");
  return (
    <main className="screen profile-screen">
      <div className="page-heading">
        <div><p className="eyebrow">Your space</p><h1>Profile</h1></div>
        <div className="page-heading-actions">
          <button className="round-action" onClick={onShare} aria-label="Share profile"><Share2 /></button>
          <button className="round-action" onClick={onEdit} aria-label="Edit profile"><Pencil /></button>
        </div>
      </div>
      <section className="profile-card">
        <div className="profile-avatar" aria-label={`${displayName}'s profile picture`}>
          <UserAvatar name={displayName} photoUrl={library.user.photoUrl} />
        </div>
        <h2>{displayName}</h2>
        <p>{library.user.username ? `@${library.user.username}` : "Telegram listener"}</p>
        {library.user.bio ? <p className="profile-bio">{library.user.bio}</p> : <p className="profile-bio profile-bio-empty">Add a bio so listeners know what you love.</p>}
        <div className="profile-social-stats">
          <span><strong>{publicPlaylists.length}</strong> public</span>
          <span><strong>{library.followedPlaylists.length}</strong> following</span>
          <span><strong>{library.playlists.reduce((total, playlist) => total + playlist.followerCount, 0)}</strong> followers</span>
        </div>
      </section>
      <section className="profile-public-playlists">
        <div className="section-heading"><div><p className="eyebrow">Visible to everyone</p><h2>Public playlists</h2></div></div>
        {publicPlaylists.length ? (
          <div className="playlist-grid compact-playlist-grid">
            {publicPlaylists.map((playlist) => (
              <button className="playlist-card" key={playlist.id} onClick={() => onOpenPlaylist(playlist.id)}>
                <PlaylistCover playlist={playlist} />
                <span className="playlist-card-title">{playlist.name}</span>
                <span className="playlist-card-meta">{formatSongCount(playlist.trackCount)}</span>
              </button>
            ))}
          </div>
        ) : <p className="profile-section-empty">Make a playlist public and it will appear here.</p>}
      </section>
      <section className="activity-card">
        <div className="section-heading">
          <div><p className="eyebrow">Collaborative activity</p><h2>Notifications</h2></div>
          {library.unreadNotifications ? <button className="text-action" onClick={onMarkRead}>Mark read</button> : null}
        </div>
        {library.notifications.length ? library.notifications.slice(0, 8).map((notification) => (
          <button className={`activity-item ${notification.read ? "" : "unread"}`} key={notification.id} onClick={() => notification.playlistId && onOpenPlaylist(notification.playlistId)}>
            <span><Bell /></span>
            <div><p>{notification.message}</p><small>{formatRelativeDate(notification.createdAt)}</small></div>
          </button>
        )) : <p className="profile-section-empty">Collaboration updates will appear here.</p>}
      </section>
      <section className="playback-health-card">
        <div><p className="eyebrow">Last 7 days</p><h2>Playback health</h2></div>
        <dl>
          <div><dt>Starts</dt><dd>{library.playbackSummary.starts}</dd></div>
          <div><dt>Average start</dt><dd>{library.playbackSummary.averageStartupMs === null ? "—" : `${library.playbackSummary.averageStartupMs} ms`}</dd></div>
          <div><dt>Buffer events</dt><dd>{library.playbackSummary.stalls}</dd></div>
          <div><dt>Recovered</dt><dd>{library.playbackSummary.recoveredRetries}</dd></div>
        </dl>
        <p>{library.playbackSummary.errors ? `${library.playbackSummary.errors} stream errors recorded for diagnostics.` : "No stream errors recorded."}</p>
        <h3>Bot imports</h3>
        <dl className="import-health-stats">
          <div><dt>Added</dt><dd>{library.importSummary.imported}</dd></div>
          <div><dt>Duplicates</dt><dd>{library.importSummary.duplicates}</dd></div>
          <div><dt>Failed</dt><dd>{library.importSummary.failed}</dd></div>
        </dl>
      </section>
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
  onSwipeQueue,
  onSwipeLike,
  onAddMusic,
  onEdit,
  onDelete,
  onVisibility,
  onShare,
  folders,
  onFolder,
  onCollaboration,
  onLeave,
  busy,
  selecting,
  selectedIds,
  onStartSelecting,
  onCancelSelecting,
  onSelect,
  onSelectAll,
}: {
  playlist: Playlist;
  onBack: () => void;
  onPlay: () => void;
  onShuffle: () => void;
  onTrackPlay: (track: Track) => void;
  onMore: (track: Track) => void;
  onSwipeQueue: (track: Track) => void;
  onSwipeLike: (track: Track) => void;
  onAddMusic: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onVisibility: () => void;
  onShare: () => void;
  folders: PlaylistFolder[];
  onFolder: (folderId: string | null) => void;
  onCollaboration: () => void;
  onLeave: () => void;
  busy: boolean;
  selecting: boolean;
  selectedIds: string[];
  onStartSelecting: () => void;
  onCancelSelecting: () => void;
  onSelect: (trackId: string) => void;
  onSelectAll: () => void;
}) {
  const isOwner = playlist.access === "owner";
  const isEditablePlaylist = playlist.kind === "standard" && isOwner;
  return (
    <main className="screen playlist-detail">
      <button className="back-button" onClick={onBack}><ArrowLeft /> Playlists</button>
      <section className="playlist-hero">
        <PlaylistCover playlist={playlist} large />
        <p className="eyebrow">{isOwner ? "Playlist" : `Collaborative playlist by ${playlist.ownerName}`}</p>
        <h1>{playlist.name}</h1>
        {playlist.description ? <p className="playlist-description">{playlist.description}</p> : null}
        <p className="playlist-stats">{formatSongCount(playlist.trackCount)} · {formatCollectionDuration(playlist.duration)}</p>
        <div className="playlist-actions">
          {playlist.kind === "standard" ? <button className="secondary-button playlist-add-music" onClick={onAddMusic} disabled={busy || selecting}><ListPlus /> Add music</button> : null}
          <button className="secondary-button" onClick={onShuffle} disabled={busy || selecting || !playlist.trackCount}><Shuffle /> Shuffle</button>
          <button className="play-button" onClick={onPlay} disabled={busy || selecting || !playlist.trackCount}><Play fill="currentColor" /></button>
          {isEditablePlaylist ? (
            <button className="playlist-delete" onClick={onDelete} disabled={busy || selecting} aria-label={`Delete ${playlist.name}`} title="Delete playlist"><Trash2 /></button>
          ) : null}
        </div>
        {isEditablePlaylist ? (
          <div className="playlist-sharing-actions">
            <button onClick={onEdit} disabled={busy || selecting}><Pencil /> Edit</button>
            <button onClick={onVisibility} disabled={busy || selecting}>
              {playlist.visibility === "public" ? <Globe2 /> : <Lock />}
              {playlist.visibility === "public" ? "Public" : "Private"}
            </button>
            <button onClick={onShare} disabled={busy || selecting || playlist.visibility !== "public"} title={playlist.visibility === "private" ? "Make this playlist public to share it" : "Share playlist"}>
              <Share2 /> Share
            </button>
            <button onClick={onCollaboration} disabled={busy || selecting || playlist.visibility !== "public"} title={playlist.visibility === "private" ? "Make this playlist public before enabling collaboration" : undefined}>
              <Users /> {playlist.collaborative ? "Collaborative" : "Enable collaboration"}
            </button>
          </div>
        ) : null}
        {isEditablePlaylist ? (
          <label className="playlist-folder-select">
            <Folder />
            <span>Folder</span>
            <select value={playlist.folderId ?? ""} onChange={(event) => onFolder(event.target.value || null)} disabled={busy || selecting}>
              <option value="">Unfiled</option>
              {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
            </select>
          </label>
        ) : null}
        {!isOwner ? (
          <div className="playlist-sharing-actions collaborator-actions">
            <span><Users /> {playlist.collaboratorCount} {playlist.collaboratorCount === 1 ? "collaborator" : "collaborators"}</span>
            <button onClick={onLeave} disabled={busy || selecting}><ArrowLeft /> Leave collaboration</button>
          </div>
        ) : null}
        {playlist.trackCount ? (
          <button className="playlist-select-action" onClick={selecting ? onCancelSelecting : onStartSelecting} disabled={busy}>
            {selecting ? <X /> : <Check />} {selecting ? "Cancel selection" : "Select songs"}
          </button>
        ) : null}
        {selecting ? <button className="text-action playlist-select-all" onClick={onSelectAll}>Select all</button> : null}
      </section>
      <section className="playlist-track-list">
        {playlist.tracks.length ? playlist.tracks.map((track, index) => (
          <TrackRow
            key={track.id}
            track={track}
            ordinal={index + 1}
            onPlay={() => onTrackPlay(track)}
            onMore={() => onMore(track)}
            onSwipeQueue={() => onSwipeQueue(track)}
            onSwipeLike={() => onSwipeLike(track)}
            selecting={selecting}
            selected={selectedIds.includes(track.id)}
            onSelect={() => onSelect(track.id)}
          />
        )) : <EmptyState title="This playlist is waiting" copy="Use Add music to choose songs from your library." />}
      </section>
    </main>
  );
}

function MiniPlayer({
  track,
  isPlaying,
  bufferingMessage,
  progress,
  onOpen,
  onToggle,
}: {
  track: Track;
  isPlaying: boolean;
  bufferingMessage: string | null;
  progress: number;
  onOpen: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="mini-player">
      <button className="mini-player-main" onClick={onOpen} aria-label={`Open player for ${track.title}`}>
        <Cover seed={track.artworkSeed} size="small" label={track.title} artworkUrl={track.artworkUrl} />
        <span><strong>{track.title}</strong><small>{bufferingMessage ?? track.artist}</small></span>
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
  repeatMode,
  volume,
  muted,
  bufferingMessage,
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
  repeatMode: RepeatMode;
  volume: number;
  muted: boolean;
  bufferingMessage: string | null;
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
  const playerRef = useRef<HTMLElement>(null);
  const playerOnCloseRef = useRef(onClose);
  const playerDragRef = useRef<{ startY: number; lastY: number; startTime: number } | null>(null);
  const playerTouchRef = useRef<{ startY: number; lastY: number; startTime: number } | null>(null);
  const [playerDragY, setPlayerDragY] = useState(0);
  const safeDuration = Math.max(duration || 0, 0);
  const displayedVolume = muted ? 0 : volume;
  const VolumeIcon = muted || volume === 0 ? VolumeX : Volume2;
  const repeatLabel = repeatMode === "off"
    ? "Repeat is off. Turn on repeat all"
    : repeatMode === "all"
      ? "Repeat all is on. Turn on repeat song"
      : "Repeat song is on. Turn repeat off";

  useEffect(() => {
    playerOnCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !open) return;
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("button, a, input, textarea, select, [role='button']")) return;
      const startY = event.touches[0].clientY;
      playerTouchRef.current = { startY, lastY: startY, startTime: performance.now() };
    };
    const onTouchMove = (event: TouchEvent) => {
      const drag = playerTouchRef.current;
      if (!drag || event.touches.length !== 1) return;
      drag.lastY = event.touches[0].clientY;
      const distance = drag.lastY - drag.startY;
      if (distance <= 0) return;
      event.preventDefault();
      setPlayerDragY(distance);
    };
    const finishTouch = () => {
      const drag = playerTouchRef.current;
      if (!drag) return;
      playerTouchRef.current = null;
      const distance = Math.max(0, drag.lastY - drag.startY);
      const velocity = distance / Math.max(1, performance.now() - drag.startTime);
      if (distance >= 72 || (distance >= 28 && velocity > 0.55)) playerOnCloseRef.current();
      setPlayerDragY(0);
    };
    const header = player.querySelector<HTMLElement>(".player-header");
    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0 || (event.target instanceof Element && event.target.closest("button"))) return;
      event.preventDefault();
      playerDragRef.current = { startY: event.clientY, lastY: event.clientY, startTime: performance.now() };
    };
    const onMouseMove = (event: MouseEvent) => {
      const drag = playerDragRef.current;
      if (!drag) return;
      drag.lastY = event.clientY;
      setPlayerDragY(Math.max(0, drag.lastY - drag.startY));
    };
    const onMouseUp = () => {
      const drag = playerDragRef.current;
      if (!drag) return;
      playerDragRef.current = null;
      const distance = Math.max(0, drag.lastY - drag.startY);
      const velocity = distance / Math.max(1, performance.now() - drag.startTime);
      if (distance >= 72 || (distance >= 28 && velocity > 0.55)) playerOnCloseRef.current();
      setPlayerDragY(0);
    };
    player.addEventListener("touchstart", onTouchStart, { passive: true });
    player.addEventListener("touchmove", onTouchMove, { passive: false });
    player.addEventListener("touchend", finishTouch, { passive: true });
    player.addEventListener("touchcancel", finishTouch, { passive: true });
    header?.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      player.removeEventListener("touchstart", onTouchStart);
      player.removeEventListener("touchmove", onTouchMove);
      player.removeEventListener("touchend", finishTouch);
      player.removeEventListener("touchcancel", finishTouch);
      header?.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [open]);

  return (
    <section
      ref={playerRef}
      className={`now-playing cover-${track.artworkSeed % 8} ${open ? "now-playing-open" : ""}`}
      role="dialog"
      aria-modal={open ? "true" : undefined}
      aria-hidden={!open}
      aria-label="Now playing"
      style={{ "--player-drag": `${playerDragY}px` } as React.CSSProperties}
    >
      <div className="now-playing-wash" />
      <header className="player-header">
        <button onClick={onClose} aria-label="Minimize player"><ChevronDown /></button>
        <div><span>{bufferingMessage ?? "Now playing"}</span><strong>From your Telegram library · {queuePosition}/{queueLength}</strong></div>
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
          <button className={`repeat-control ${repeatMode !== "off" ? "active" : ""}`} onClick={onRepeat} aria-label={repeatLabel}>
            <Repeat2 />
            {repeatMode === "one" ? <span aria-hidden="true">1</span> : null}
          </button>
        </div>
        <button className="queue-open-button" onClick={onQueue}>
          <ListMusic />
          <span>Open queue</span>
          <strong>{queuePosition} of {queueLength}</strong>
          <ChevronRight />
        </button>
        <div className="player-volume-bar">
          <button
            onClick={onMuteToggle}
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
            onChange={(event) => onVolumeChange(Number(event.target.value))}
            style={{ "--volume": `${displayedVolume * 100}%` } as React.CSSProperties}
          />
          <output>{muted ? "Muted" : `${Math.round(displayedVolume * 100)}%`}</output>
        </div>
      </div>
    </section>
  );
}

function BottomNav({ tab, onSelect, unreadNotifications }: { tab: Tab; onSelect: (tab: Tab) => void; unreadNotifications: number }) {
  const items: Array<{ id: Tab; label: string; Icon: typeof House }> = [
    { id: "home", label: "Home", Icon: House },
    { id: "library", label: "Library", Icon: Library },
    { id: "playlists", label: "Playlists", Icon: ListMusic },
    { id: "profile", label: "Profile", Icon: UserRound },
  ];
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {items.map(({ id, label, Icon }) => (
        <button className={tab === id ? "active" : ""} onClick={() => onSelect(id)} key={id}>
          <Icon fill={tab === id ? "currentColor" : "none"} />
          <span>{label}</span>
          {id === "profile" && unreadNotifications ? <em className="nav-notification-badge">{Math.min(99, unreadNotifications)}</em> : null}
        </button>
      ))}
    </nav>
  );
}

function SelectionToolbar({
  tracks,
  currentPlaylist,
  busy,
  onClose,
  onOrganize,
  onLike,
  onShare,
  onSend,
  onRemove,
  onDelete,
}: {
  tracks: Track[];
  currentPlaylist: Playlist | null;
  busy: boolean;
  onClose: () => void;
  onOrganize: () => void;
  onLike: () => void;
  onShare: () => void;
  onSend: () => void;
  onRemove?: () => void;
  onDelete: () => void;
}) {
  const selectedCount = tracks.length;
  const allLiked = selectedCount > 0 && tracks.every((track) => track.liked);
  const allOwned = selectedCount > 0 && tracks.every((track) => track.owned);
  return (
    <aside className="selection-toolbar" aria-label="Selected song actions">
      <div className="selection-toolbar-heading">
        <strong>{selectedCount ? `${selectedCount} selected` : "Select songs"}</strong>
        <button onClick={onClose} aria-label="Cancel selection"><X /></button>
      </div>
      <div className="selection-actions">
        {allOwned ? <button onClick={onOrganize} disabled={busy}><ListPlus /><span>{currentPlaylist?.kind === "standard" ? "Add / move" : "Add to"}</span></button> : null}
        {allOwned ? <button onClick={onLike} disabled={busy}><Heart fill={allLiked ? "currentColor" : "none"} /><span>{allLiked ? "Unlike" : "Like"}</span></button> : null}
        {allOwned ? <button onClick={onShare} disabled={busy || selectedCount > 10} title={selectedCount > 10 ? "Share up to 10 songs at once" : "Share songs"}><Share2 /><span>Share</span></button> : null}
        <button onClick={onSend} disabled={busy || !selectedCount}><Send /><span>Telegram</span></button>
        {onRemove ? <button onClick={onRemove} disabled={busy || !selectedCount}><X /><span>Remove here</span></button> : null}
        {allOwned ? <button className="destructive" onClick={onDelete} disabled={busy}><Trash2 /><span>Delete</span></button> : null}
      </div>
    </aside>
  );
}

function Sheet({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const closeTimerRef = useRef(0);
  const closingRef = useRef(false);
  const dragRef = useRef<{ startY: number; lastY: number; startTime: number } | null>(null);
  const touchDragRef = useRef<{ startY: number; lastY: number; startTime: number } | null>(null);
  const [closing, setClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => onCloseRef.current(), 220);
  }, []);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      requestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(closeTimerRef.current);
    };
  }, [requestClose]);
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const onTouchStart = (event: TouchEvent) => {
      if (closingRef.current || event.touches.length !== 1 || sheet.scrollTop > 1) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("button, a, input, textarea, select, [role='button'], [data-no-swipe-dismiss]")) return;
      const startY = event.touches[0].clientY;
      touchDragRef.current = { startY, lastY: startY, startTime: performance.now() };
    };
    const onTouchMove = (event: TouchEvent) => {
      const drag = touchDragRef.current;
      if (!drag || event.touches.length !== 1) return;
      drag.lastY = event.touches[0].clientY;
      const distance = drag.lastY - drag.startY;
      if (distance <= 0 || sheet.scrollTop > 1) return;
      event.preventDefault();
      setDragY(distance);
    };
    const finishTouch = () => {
      const drag = touchDragRef.current;
      if (!drag) return;
      touchDragRef.current = null;
      const distance = Math.max(0, drag.lastY - drag.startY);
      const velocity = distance / Math.max(1, performance.now() - drag.startTime);
      if (distance >= 72 || (distance >= 28 && velocity > 0.55)) requestClose();
      else setDragY(0);
    };
    const handle = sheet.querySelector<HTMLElement>(".sheet-handle");
    const onMouseDown = (event: MouseEvent) => {
      if (closingRef.current || event.button !== 0) return;
      event.preventDefault();
      dragRef.current = { startY: event.clientY, lastY: event.clientY, startTime: performance.now() };
    };
    const onMouseMove = (event: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      drag.lastY = event.clientY;
      setDragY(Math.max(0, drag.lastY - drag.startY));
    };
    const onMouseUp = () => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      const distance = Math.max(0, drag.lastY - drag.startY);
      const velocity = distance / Math.max(1, performance.now() - drag.startTime);
      if (distance >= 72 || (distance >= 28 && velocity > 0.55)) requestClose();
      else setDragY(0);
    };
    sheet.addEventListener("touchstart", onTouchStart, { passive: true });
    sheet.addEventListener("touchmove", onTouchMove, { passive: false });
    sheet.addEventListener("touchend", finishTouch, { passive: true });
    sheet.addEventListener("touchcancel", finishTouch, { passive: true });
    handle?.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      sheet.removeEventListener("touchstart", onTouchStart);
      sheet.removeEventListener("touchmove", onTouchMove);
      sheet.removeEventListener("touchend", finishTouch);
      sheet.removeEventListener("touchcancel", finishTouch);
      handle?.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [requestClose]);
  return (
    <div className={`sheet-layer ${closing ? "sheet-layer-closing" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
      <button className="sheet-backdrop" onClick={requestClose} aria-label="Close" />
      <div
        ref={sheetRef}
        className={`sheet ${dragY ? "sheet-dragging" : ""}`}
        style={{ "--sheet-drag": `${dragY}px` } as React.CSSProperties}
        onClickCapture={(event) => {
          const target = event.target instanceof Element ? event.target.closest("[data-sheet-close]") : null;
          if (!target) return;
          event.preventDefault();
          event.stopPropagation();
          requestClose();
        }}
      >
        <div className="sheet-handle" aria-label="Swipe down to close" />
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
      <div className="sheet-heading"><div><p className="eyebrow">A new collection</p><h2>Create playlist</h2></div><button className="icon-button" data-sheet-close aria-label="Close"><X /></button></div>
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

function EditPlaylistSheet({
  playlist,
  busy,
  onClose,
  onSave,
}: {
  playlist: Playlist;
  busy: boolean;
  onClose: () => void;
  onSave: (details: { name: string; description: string; coverSeed: number | null; coverImage: string | null }) => void;
}) {
  const [name, setName] = useState(playlist.name);
  const [description, setDescription] = useState(playlist.description);
  const [coverSeed, setCoverSeed] = useState<number | null>(playlist.coverSeed);
  const [coverImage, setCoverImage] = useState<string | null>(playlist.coverImage);
  const [coverError, setCoverError] = useState("");
  const [preparingCover, setPreparingCover] = useState(false);
  const changed = name.trim() !== playlist.name
    || description.trim() !== playlist.description
    || coverSeed !== playlist.coverSeed
    || coverImage !== playlist.coverImage;
  return (
    <Sheet onClose={onClose} title={`Edit ${playlist.name}`}>
      <div className="sheet-heading"><div><p className="eyebrow">Playlist details</p><h2>Edit playlist</h2></div><button className="icon-button" data-sheet-close aria-label="Close"><X /></button></div>
      <form
        className="playlist-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim() && changed) onSave({ name: name.trim(), description: description.trim(), coverSeed, coverImage });
        }}
      >
        <label><span>Name</span><input autoFocus maxLength={60} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label><span>Description <em>optional</em></span><textarea maxLength={160} value={description} onChange={(event) => setDescription(event.target.value)} rows={3} /></label>
        <fieldset className="cover-picker">
          <legend>Cover</legend>
          <label className={`cover-upload ${coverImage ? "selected" : ""}`}>
            <span
              className="cover-upload-preview"
              style={coverImage ? { backgroundImage: `url(${coverImage})` } : undefined}
            >
              {!coverImage ? preparingCover ? <LoaderCircle className="spin" /> : <ImagePlus /> : <Check />}
            </span>
            <span><strong>Choose your own image</strong><small>Square crop · JPEG, PNG, or WebP</small></span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy || preparingCover}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = "";
                if (!file) return;
                setCoverError("");
                setPreparingCover(true);
                void squareArtworkFromFile(file)
                  .then((image) => {
                    setCoverImage(image);
                    setCoverSeed(null);
                  })
                  .catch((imageError) => setCoverError(imageError instanceof Error ? imageError.message : "Could not prepare that image."))
                  .finally(() => setPreparingCover(false));
              }}
            />
          </label>
          {coverError ? <p className="cover-upload-error" role="alert">{coverError}</p> : null}
          <div>
            <button type="button" className={`cover-choice cover-choice-auto ${coverSeed === null && !coverImage ? "selected" : ""}`} onClick={() => { setCoverSeed(null); setCoverImage(null); }} aria-pressed={coverSeed === null && !coverImage}><Music2 /><span>Auto</span></button>
            {Array.from({ length: 8 }, (_, seed) => (
              <button type="button" className={`cover-choice cover-${seed} ${coverSeed === seed && !coverImage ? "selected" : ""}`} key={seed} onClick={() => { setCoverSeed(seed); setCoverImage(null); }} aria-label={`Cover color ${seed + 1}`} aria-pressed={coverSeed === seed && !coverImage}>
                {coverSeed === seed ? <Check /> : <Music2 />}
              </button>
            ))}
          </div>
        </fieldset>
        <button className="primary-button full-button" type="submit" disabled={!name.trim() || !changed || busy || preparingCover}>
          {busy ? <LoaderCircle className="spin" /> : <Check />} Save changes
        </button>
      </form>
    </Sheet>
  );
}

function ProfileEditSheet({
  library,
  busy,
  onClose,
  onSave,
}: {
  library: LibraryPayload;
  busy: boolean;
  onClose: () => void;
  onSave: (details: { displayName: string; bio: string; customPhoto: string | null | "keep" }) => void;
}) {
  const [displayName, setDisplayName] = useState(library.user.displayName);
  const [bio, setBio] = useState(library.user.bio);
  const [customPhoto, setCustomPhoto] = useState<string | null | "keep">("keep");
  const [photoError, setPhotoError] = useState("");
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const previewUrl = typeof customPhoto === "string" && customPhoto !== "keep"
    ? customPhoto
    : customPhoto === "keep" ? library.user.photoUrl : null;
  const changed = displayName.trim() !== library.user.displayName || bio.trim() !== library.user.bio || customPhoto !== "keep";
  return (
    <Sheet onClose={onClose} title="Edit profile">
      <div className="sheet-heading"><div><p className="eyebrow">Your public identity</p><h2>Edit profile</h2></div><button className="icon-button" data-sheet-close aria-label="Close"><X /></button></div>
      <form className="playlist-form profile-edit-form" onSubmit={(event) => { event.preventDefault(); if (displayName.trim() && changed) onSave({ displayName: displayName.trim(), bio: bio.trim(), customPhoto }); }}>
        <label><span>Display name</span><input autoFocus maxLength={50} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
        <label><span>Bio <em>optional</em></span><textarea maxLength={160} value={bio} onChange={(event) => setBio(event.target.value)} placeholder="What kind of music do you collect?" rows={3} /></label>
        <fieldset className="cover-picker profile-photo-picker">
          <legend>Profile picture</legend>
          <label className="cover-upload">
            <span className="profile-photo-preview"><UserAvatar name={displayName || library.user.firstName} photoUrl={previewUrl} /></span>
            <span><strong>Choose a picture</strong><small>Square crop · JPEG, PNG, or WebP</small></span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy || preparingPhoto}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = "";
                if (!file) return;
                setPhotoError("");
                setPreparingPhoto(true);
                void squareArtworkFromFile(file, 500_000)
                  .then(setCustomPhoto)
                  .catch((imageError) => setPhotoError(imageError instanceof Error ? imageError.message : "Could not prepare that image."))
                  .finally(() => setPreparingPhoto(false));
              }}
            />
          </label>
          {library.user.hasCustomPhoto || customPhoto !== "keep" ? <button type="button" className="text-action remove-profile-photo" onClick={() => setCustomPhoto(null)}>Use Telegram picture</button> : null}
          {photoError ? <p className="cover-upload-error" role="alert">{photoError}</p> : null}
        </fieldset>
        <button className="primary-button full-button" type="submit" disabled={!displayName.trim() || !changed || busy || preparingPhoto}>{busy ? <LoaderCircle className="spin" /> : <Check />} Save profile</button>
      </form>
    </Sheet>
  );
}

function PlaylistFolderSheet({
  folder,
  busy,
  onClose,
  onSave,
  onDelete,
}: {
  folder: PlaylistFolder | "new";
  busy: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(folder === "new" ? "" : folder.name);
  const changed = folder === "new" ? Boolean(name.trim()) : name.trim() !== folder.name;
  return (
    <Sheet onClose={onClose} title={folder === "new" ? "Create folder" : `Edit ${folder.name}`}>
      <div className="sheet-heading"><div><p className="eyebrow">Organize playlists</p><h2>{folder === "new" ? "New folder" : "Edit folder"}</h2></div><button className="icon-button" data-sheet-close aria-label="Close"><X /></button></div>
      <form className="playlist-form" onSubmit={(event) => { event.preventDefault(); if (changed) onSave(name.trim()); }}>
        <label><span>Name</span><input autoFocus maxLength={50} value={name} onChange={(event) => setName(event.target.value)} placeholder="Road trips" /></label>
        <button className="primary-button full-button" type="submit" disabled={!changed || busy}>{busy ? <LoaderCircle className="spin" /> : folder === "new" ? <Plus /> : <Check />} {folder === "new" ? "Create folder" : "Save folder"}</button>
        {onDelete ? <button className="secondary-button destructive-button full-button" type="button" onClick={onDelete} disabled={busy}><Trash2 /> Delete folder</button> : null}
      </form>
    </Sheet>
  );
}

function EditTrackSheet({
  track,
  busy,
  onClose,
  onSave,
}: {
  track: Track;
  busy: boolean;
  onClose: () => void;
  onSave: (details: { title: string; artist: string; customArtwork: string | null | "keep" }) => void;
}) {
  const [title, setTitle] = useState(track.title);
  const [artist, setArtist] = useState(track.artist);
  const [customArtwork, setCustomArtwork] = useState<string | null | "keep">("keep");
  const [artworkError, setArtworkError] = useState("");
  const [preparingArtwork, setPreparingArtwork] = useState(false);
  const changed = title.trim() !== track.title || artist.trim() !== track.artist || customArtwork !== "keep";
  const previewUrl = typeof customArtwork === "string" && customArtwork !== "keep"
    ? customArtwork
    : customArtwork === "keep"
      ? track.artworkUrl
      : undefined;
  return (
    <Sheet onClose={onClose} title={`Edit ${track.title}`}>
      <div className="sheet-heading"><div><p className="eyebrow">Song details</p><h2>Edit song</h2></div><button className="icon-button" data-sheet-close aria-label="Close"><X /></button></div>
      <form
        className="playlist-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (title.trim() && artist.trim() && changed) onSave({ title: title.trim(), artist: artist.trim(), customArtwork });
        }}
      >
        <label><span>Title</span><input autoFocus maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label><span>Artist</span><input maxLength={100} value={artist} onChange={(event) => setArtist(event.target.value)} /></label>
        <fieldset className="cover-picker track-artwork-picker">
          <legend>Artwork</legend>
          <label className={`cover-upload ${customArtwork !== "keep" ? "selected" : ""}`}>
            <span className="cover-upload-preview" style={previewUrl ? { backgroundImage: `url(${previewUrl})` } : undefined}>
              {!previewUrl ? preparingArtwork ? <LoaderCircle className="spin" /> : <ImagePlus /> : customArtwork !== "keep" ? <Check /> : null}
            </span>
            <span><strong>Choose a square image</strong><small>JPEG, PNG, or WebP · under 8 MB</small></span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy || preparingArtwork}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = "";
                if (!file) return;
                setArtworkError("");
                setPreparingArtwork(true);
                void squareArtworkFromFile(file)
                  .then(setCustomArtwork)
                  .catch((imageError) => setArtworkError(imageError instanceof Error ? imageError.message : "Could not prepare that image."))
                  .finally(() => setPreparingArtwork(false));
              }}
            />
          </label>
          {artworkError ? <p className="cover-upload-error" role="alert">{artworkError}</p> : null}
          <button className="secondary-button full-button" type="button" onClick={() => setCustomArtwork(null)} disabled={busy || preparingArtwork || (!track.hasCustomArtwork && customArtwork === null)}>
            <Music2 /> {track.hasCustomArtwork ? "Use original Telegram artwork" : "Use tune artwork"}
          </button>
        </fieldset>
        <button className="primary-button full-button" type="submit" disabled={!title.trim() || !artist.trim() || !changed || busy || preparingArtwork}>
          {busy ? <LoaderCircle className="spin" /> : <Check />} Save song details
        </button>
      </form>
    </Sheet>
  );
}

function BulkPlaylistSheet({
  tracks,
  playlists,
  currentPlaylist,
  busy,
  onClose,
  onApply,
  onCreate,
}: {
  tracks: Track[];
  playlists: Playlist[];
  currentPlaylist: Playlist | null;
  busy: boolean;
  onClose: () => void;
  onApply: (playlistId: string, move: boolean) => void;
  onCreate: (move: boolean) => void;
}) {
  const [targetId, setTargetId] = useState("");
  const [move, setMove] = useState(false);
  const targets = playlists.filter((playlist) => playlist.id !== currentPlaylist?.id);
  return (
    <Sheet onClose={onClose} title="Organize selected songs">
      <div className="sheet-heading"><div><p className="eyebrow">{tracks.length} selected</p><h2>Add to playlist</h2></div><button className="icon-button" data-sheet-close aria-label="Close"><X /></button></div>
      <div className="bulk-playlist-list">
        {targets.map((playlist) => (
          <button type="button" className={targetId === playlist.id ? "selected" : ""} key={playlist.id} onClick={() => setTargetId(playlist.id)} disabled={busy}>
            <PlaylistCover playlist={playlist} />
            <span><strong>{playlist.name}</strong><small>{formatSongCount(playlist.trackCount)}</small></span>
            <i>{targetId === playlist.id ? <Check /> : <Plus />}</i>
          </button>
        ))}
        {!targets.length ? <p className="music-picker-empty">Create another playlist to organize these songs.</p> : null}
      </div>
      {currentPlaylist ? (
        <label className="move-toggle">
          <input type="checkbox" checked={move} onChange={(event) => setMove(event.target.checked)} />
          <span><strong>Move instead of add</strong><small>Remove selected songs from {currentPlaylist.name} after adding them.</small></span>
        </label>
      ) : null}
      <button className="new-playlist-inline" onClick={() => onCreate(move)} disabled={busy}><Plus /> New playlist</button>
      <button className="primary-button full-button" disabled={busy || !targetId} onClick={() => onApply(targetId, move)}>
        {busy ? <LoaderCircle className="spin" /> : move ? <ArrowRight /> : <ListPlus />}
        {move ? "Move songs" : "Add songs"}
      </button>
    </Sheet>
  );
}

function DeleteTracksSheet({
  tracks,
  busy,
  onClose,
  onDelete,
}: {
  tracks: Track[];
  busy: boolean;
  onClose: () => void;
  onDelete: () => void;
}) {
  const label = tracks.length === 1 ? `“${tracks[0].title}”` : `${tracks.length} songs`;
  return (
    <Sheet onClose={onClose} title="Remove from My Library">
      <div className="delete-playlist-confirmation">
        <span><Trash2 /></span>
        <p className="eyebrow">My Library</p>
        <h2>Remove {label}?</h2>
        <p>This permanently removes {tracks.length === 1 ? "the song" : "these songs"} from every playlist, Liked Songs, and listening history.</p>
        <div>
          <button className="secondary-button" data-sheet-close disabled={busy}>Cancel</button>
          <button className="danger-button" onClick={onDelete} disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Trash2 />} Remove</button>
        </div>
      </div>
    </Sheet>
  );
}

function BugReportSheet({
  busy,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (description: string) => void;
}) {
  const [description, setDescription] = useState("");
  return (
    <Sheet onClose={onClose} title="Report a bug">
      <div className="sheet-heading"><div><p className="eyebrow">Help improve tune</p><h2>Report a bug</h2></div><button className="icon-button" data-sheet-close aria-label="Close"><X /></button></div>
      <form className="playlist-form" onSubmit={(event) => { event.preventDefault(); if (description.trim().length >= 3) onSubmit(description.trim()); }}>
        <label><span>What happened?</span><textarea autoFocus rows={6} minLength={3} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Tell us what you expected and what happened instead…" /></label>
        <p className="bug-context-note">Telegram version, platform, theme, and screen size are attached automatically. No messages or music files are included.</p>
        <button className="primary-button full-button" type="submit" disabled={busy || description.trim().length < 3}>
          {busy ? <LoaderCircle className="spin" /> : <Bug />} Send report
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
        <button className="icon-button" data-sheet-close aria-label="Close"><X /></button>
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
          <button className="secondary-button" data-sheet-close disabled={busy}>Cancel</button>
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
        <button className="icon-button" data-sheet-close aria-label="Close queue"><X /></button>
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
  onSwipeQueue,
  onSwipeLike,
}: {
  tracks: Track[];
  onClose: () => void;
  onPlay: (track: Track) => void;
  onMore: (track: Track) => void;
  onSwipeQueue: (track: Track) => void;
  onSwipeLike: (track: Track) => void;
}) {
  return (
    <Sheet onClose={onClose} title="Listening history">
      <div className="sheet-heading history-heading">
        <div><p className="eyebrow">Listen again</p><h2>Recently played</h2></div>
        <button className="icon-button" data-sheet-close aria-label="Close history"><X /></button>
      </div>
      <div className="history-sheet-list">
        {tracks.map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            onPlay={() => onPlay(track)}
            onMore={() => onMore(track)}
            onSwipeQueue={() => onSwipeQueue(track)}
            onSwipeLike={() => onSwipeLike(track)}
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
  onOpenSong,
  onAddPlaylist,
  onOpenPlaylist,
  onToggleFollow,
  onCollaborate,
}: {
  preview: SharedPreview;
  busy: boolean;
  onClose: () => void;
  onAddSong: () => void;
  onOpenSong: () => void;
  onAddPlaylist: () => void;
  onOpenPlaylist: (shareId: string) => void;
  onToggleFollow: () => void;
  onCollaborate: () => void;
}) {
  if (preview.type === "song") {
    return (
      <Sheet onClose={onClose} title={`Shared song: ${preview.title}`}>
        <div className="shared-item-heading">
          <button className="icon-button" data-sheet-close aria-label="Close shared song"><X /></button>
          <Cover seed={preview.artworkSeed} size="large" label={preview.title} />
          <p className="eyebrow">{preview.ownerName} sent you a song</p>
          <h2>{preview.title}</h2>
          <p>{preview.artist} · {formatDuration(preview.duration)}</p>
        </div>
        <button className="primary-button full-button" onClick={preview.alreadyAdded ? onOpenSong : onAddSong} disabled={busy}>
          {busy ? <LoaderCircle className="spin" /> : preview.alreadyAdded ? <Check /> : <Plus />}
          {preview.alreadyAdded ? "Play from my library" : "Add to my library"}
        </button>
      </Sheet>
    );
  }

  if (preview.type === "profile") {
    return (
      <Sheet onClose={onClose} title={`${preview.displayName}'s profile`}>
        <div className="sheet-heading">
          <div><p className="eyebrow">Public profile</p><h2>{preview.displayName}</h2></div>
          <button className="icon-button" data-sheet-close aria-label="Close shared profile"><X /></button>
        </div>
        <section className="shared-profile-card">
          <div className="profile-avatar"><UserAvatar name={preview.displayName} photoUrl={preview.photoUrl} /></div>
          {preview.bio ? <p>{preview.bio}</p> : <p className="profile-section-empty">No bio yet.</p>}
        </section>
        <div className="section-heading"><div><p className="eyebrow">Listen together</p><h2>Public playlists</h2></div></div>
        {preview.playlists.length ? (
          <div className="playlist-grid shared-profile-playlists">
            {preview.playlists.map((playlist) => (
              <button className="playlist-card" key={playlist.shareId} onClick={() => onOpenPlaylist(playlist.shareId)}>
                <PlaylistCover playlist={playlist} />
                <span className="playlist-card-title">{playlist.name}</span>
                <span className="playlist-card-meta">{formatSongCount(playlist.trackCount)}</span>
                {playlist.collaborative ? <span className="playlist-card-badge"><Users /> Collaborative</span> : null}
              </button>
            ))}
          </div>
        ) : <p className="profile-section-empty">This listener has no public playlists yet.</p>}
      </Sheet>
    );
  }

  return (
    <Sheet onClose={onClose} title={`Shared playlist: ${preview.name}`}>
      <div className="sheet-heading shared-playlist-heading">
        <div><p className="eyebrow">Public playlist by {preview.ownerName}</p><h2>{preview.name}</h2></div>
        <button className="icon-button" data-sheet-close aria-label="Close shared playlist"><X /></button>
      </div>
      <div
        className={`shared-playlist-cover ${preview.coverImage ? "playlist-cover-image" : `cover-${preview.coverSeed ?? 4}`}`}
        style={preview.coverImage ? { backgroundImage: `url(${preview.coverImage})` } : undefined}
        aria-label={`${preview.name} cover`}
      >
        {!preview.coverImage ? <Music2 /> : null}
      </div>
      {preview.description ? <p className="shared-playlist-description">{preview.description}</p> : null}
      <p className="shared-playlist-social">
        <UserPlus /> {preview.followerCount} {preview.followerCount === 1 ? "follower" : "followers"}
        <Users /> {preview.collaboratorCount} {preview.collaboratorCount === 1 ? "collaborator" : "collaborators"}
      </p>
      <p className="shared-playlist-stats">{formatSongCount(preview.trackCount)} · {formatCollectionDuration(preview.duration)}</p>
      <div className="shared-playlist-tracks">
        {preview.tracks.map((track, index) => (
          <div key={`${track.title}-${track.artist}-${index}`}>
            <Cover seed={track.artworkSeed} size="small" label={track.title} />
            <span><strong>{track.title}</strong><small>{track.artist}</small></span>
            <em>{formatDuration(track.duration)}</em>
          </div>
        ))}
      </div>
      <div className="shared-playlist-actions">
        {!preview.isOwner ? (
          <button className="secondary-button full-button" onClick={onToggleFollow} disabled={busy}>
            {preview.following ? <Check /> : <UserPlus />} {preview.following ? "Following" : "Follow playlist"}
          </button>
        ) : null}
        {preview.collaborative && !preview.isOwner && !preview.isCollaborator ? (
          <button className="secondary-button full-button" onClick={onCollaborate} disabled={busy}><Users /> Join collaboration</button>
        ) : null}
        {!preview.isOwner && !preview.isCollaborator ? (
          <button className="primary-button full-button" onClick={onAddPlaylist} disabled={busy || preview.alreadyAdded}>
            {busy ? <LoaderCircle className="spin" /> : preview.alreadyAdded ? <Check /> : <Plus />}
            {preview.alreadyAdded ? "Already in your library" : "Add a copy to my library"}
          </button>
        ) : null}
      </div>
    </Sheet>
  );
}

function TrackSheet({
  track,
  playlists,
  busy,
  onClose,
  onPlayNow,
  onSendTelegram,
  onPlayNext,
  onToggleLiked,
  onSaveLibrary,
  onEdit,
  onShare,
  onAdd,
  onRemove,
  onRemoveLibrary,
  onNewPlaylist,
}: {
  track: Track;
  playlists: Playlist[];
  busy: boolean;
  onClose: () => void;
  onPlayNow: () => void;
  onSendTelegram: () => void;
  onPlayNext: () => void;
  onToggleLiked: () => void;
  onSaveLibrary: () => void;
  onEdit: () => void;
  onShare: () => void;
  onAdd: (playlistId: string, trackId: string) => void;
  onRemove?: () => void;
  onRemoveLibrary: () => void;
  onNewPlaylist: () => void;
}) {
  const standardPlaylists = playlists.filter((playlist) => playlist.kind === "standard");
  return (
    <Sheet onClose={onClose} title={`Options for ${track.title}`}>
      <div className="sheet-track">
        <Cover seed={track.artworkSeed} size="medium" label={track.title} artworkUrl={track.artworkUrl} />
        <div><h2>{track.title}</h2><p>{track.artist}</p></div>
        <button className="icon-button" data-sheet-close aria-label="Close"><X /></button>
      </div>
      <button className="sheet-action play-now-action" onClick={onPlayNow} disabled={busy || !track.playable}><span><Play fill="currentColor" /></span><div><strong>Play now</strong><small>Listen here with full controls</small></div><ChevronRight /></button>
      <button className="sheet-action queue-next-action" onClick={onPlayNext} disabled={busy || !track.playable}><span><ListPlus /></span><div><strong>Play next</strong><small>Put it after the current song</small></div><ChevronRight /></button>
      {track.owned ? <button className={`sheet-action liked-action ${track.liked ? "liked" : ""}`} onClick={onToggleLiked} disabled={busy}>
        <span><Heart fill={track.liked ? "currentColor" : "none"} /></span>
        <div><strong>{track.liked ? "Remove from Liked Songs" : "Add to Liked Songs"}</strong><small>{track.liked ? "Keep the song in your library" : "Save it with your favorites"}</small></div>
        <ChevronRight />
      </button> : null}
      {!track.owned ? <button className="sheet-action liked-action" onClick={onSaveLibrary} disabled={busy}><span><Plus /></span><div><strong>Save to My Library</strong><small>Keep your own copy and use it anywhere</small></div><ChevronRight /></button> : null}
      {track.owned ? <button className="sheet-action" onClick={onEdit} disabled={busy}><span><Pencil /></span><div><strong>Edit song details</strong><small>Change title, artist, or artwork</small></div><ChevronRight /></button> : null}
      {track.owned ? <button className="sheet-action share-action" onClick={onShare} disabled={busy}><span><Share2 /></span><div><strong>Share song</strong><small>Send a direct tune link</small></div><ChevronRight /></button> : null}
      <button className="sheet-action" onClick={onSendTelegram} disabled={busy}><span><Send /></span><div><strong>Send to Telegram player</strong><small>Play it as an audio message in chat</small></div><ChevronRight /></button>
      {onRemove ? <button className="sheet-action danger-action" onClick={onRemove} disabled={busy}><span><X /></span><div><strong>Remove from this playlist</strong><small>The song stays in My Library</small></div><ChevronRight /></button> : null}
      {track.owned ? <button className="sheet-action danger-action library-remove-action" onClick={onRemoveLibrary} disabled={busy}>
        <span><Trash2 /></span>
        <div><strong>Remove from My Library</strong><small>Deletes it from every playlist and listening history</small></div>
        <ChevronRight />
      </button> : null}
      {track.owned ? <><div className="sheet-divider" />
      <div className="sheet-subheading"><span>Add to playlist</span><button onClick={onNewPlaylist}><Plus /> New</button></div>
      <div className="playlist-options">
        {standardPlaylists.length ? standardPlaylists.map((playlist) => {
          const alreadyAdded = playlist.tracks.some((item) => item.id === track.id);
          return (
            <button key={playlist.id} disabled={busy || alreadyAdded} onClick={() => onAdd(playlist.id, track.id)}>
              <PlaylistCover playlist={playlist} />
              <span><strong>{playlist.name}</strong><small>{formatSongCount(playlist.trackCount)}</small></span>
              {alreadyAdded ? <Check className="added-check" /> : <ListPlus />}
            </button>
          );
        }) : <p className="no-playlists">No playlists yet. Create one to start collecting tracks.</p>}
      </div></> : null}
    </Sheet>
  );
}
