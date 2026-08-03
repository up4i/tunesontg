"use client";

import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  House,
  Inbox,
  Library,
  ListMusic,
  ListPlus,
  LoaderCircle,
  MoreHorizontal,
  Music2,
  Pause,
  Play,
  Plus,
  Repeat2,
  Search,
  Send,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LibraryPayload, Playlist, Track } from "@/lib/types";

type Tab = "home" | "library" | "playlists";
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
  const [library, setLibrary] = useState<LibraryPayload | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
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
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [repeatOne, setRepeatOne] = useState(false);

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
        webApp.setHeaderColor("#11110f");
        webApp.setBackgroundColor("#11110f");
      }
      void loadLibrary();
    };
    timer = window.setTimeout(start, 0);
    return () => window.clearTimeout(timer);
  }, [loadLibrary]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

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
    if (autoplay) {
      void audio.play().catch(() => {
        setIsPlaying(false);
        setToast({ kind: "error", message: "Tap play once more to start audio." });
      });
    }
  }, []);

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

  function switchTab(next: Tab) {
    haptic();
    setTab(next);
    setSelectedPlaylistId(null);
    setSearch("");
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
              sending={sending}
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
          onAdd={addToPlaylist}
          onRemove={selectedPlaylist ? () => void removeFromPlaylist(selectedPlaylist.id, trackMenu.id) : undefined}
          onNewPlaylist={() => { setTrackMenu(null); setCreateOpen(true); }}
        />
      ) : null}
      {playerOpen && currentTrack ? (
        <NowPlaying
          track={currentTrack}
          queuePosition={queueIndex + 1}
          queueLength={queue.length}
          currentTime={currentTime}
          duration={mediaDuration || currentTrack.duration}
          isPlaying={isPlaying}
          shuffleEnabled={shuffleEnabled}
          repeatOne={repeatOne}
          onClose={() => setPlayerOpen(false)}
          onToggle={togglePlayback}
          onPrevious={previousTrack}
          onNext={() => advanceTrack(1)}
          onSeek={seekTo}
          onShuffle={toggleShuffle}
          onRepeat={() => { setRepeatOne((value) => !value); haptic(); }}
        />
      ) : null}
      {sending ? (
        <div className="sending-pill"><LoaderCircle className="spin" /> Preparing Telegram queue…</div>
      ) : null}
      {toast ? (
        <div className={`toast toast-${toast.kind}`}>
          {toast.kind === "success" ? <Check /> : <X />}
          <span>{toast.message}</span>
        </div>
      ) : null}
    </div>
  );
}

function Header({ name, subtitle = "Your music, right here." }: { name: string; subtitle?: string }) {
  return (
    <header className="topbar">
      <div>
        <div className="wordmark"><span>t</span>une</div>
        <p>{subtitle}</p>
      </div>
      <div className="avatar" aria-label={`${name}'s profile`}>{name.charAt(0).toUpperCase()}</div>
    </header>
  );
}

function HomeScreen({
  library,
  onPlay,
  onMore,
  onPlaylist,
  onSeeLibrary,
  onShuffle,
  sending,
}: {
  library: LibraryPayload;
  onPlay: (track: Track) => void;
  onMore: (track: Track) => void;
  onPlaylist: (id: string) => void;
  onSeeLibrary: () => void;
  onShuffle: () => void;
  sending: boolean;
}) {
  const featured = library.playlists[0];
  const recent = library.tracks.slice(0, 4);
  return (
    <main className="screen home-screen">
      <Header name={library.user.firstName} />

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

      <div className="telegram-note">
        <span><Send /></span>
        <div><strong>Streamed from Telegram</strong><p>Your audio stays on Telegram. Tune streams it only while you listen.</p></div>
      </div>
    </main>
  );
}

function LibraryScreen({
  tracks,
  total,
  search,
  setSearch,
  onPlay,
  onMore,
  onShuffle,
  sending,
}: {
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
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search songs or artists" />
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
  sending,
}: {
  playlist: Playlist;
  onBack: () => void;
  onPlay: () => void;
  onShuffle: () => void;
  onTrackPlay: (track: Track) => void;
  onMore: (track: Track) => void;
  sending: boolean;
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
          <button className="secondary-button" onClick={onShuffle} disabled={sending || !playlist.trackCount}><Shuffle /> Shuffle</button>
          <button className="play-button" onClick={onPlay} disabled={sending || !playlist.trackCount}><Play fill="currentColor" /></button>
        </div>
      </section>
      <section className="playlist-track-list">
        {playlist.tracks.length ? playlist.tracks.map((track, index) => (
          <TrackRow key={track.id} track={track} ordinal={index + 1} onPlay={() => onTrackPlay(track)} onMore={() => onMore(track)} />
        )) : <EmptyState title="This playlist is waiting" copy="Open a song’s menu from your library to add it here." />}
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
  track,
  queuePosition,
  queueLength,
  currentTime,
  duration,
  isPlaying,
  shuffleEnabled,
  repeatOne,
  onClose,
  onToggle,
  onPrevious,
  onNext,
  onSeek,
  onShuffle,
  onRepeat,
}: {
  track: Track;
  queuePosition: number;
  queueLength: number;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  shuffleEnabled: boolean;
  repeatOne: boolean;
  onClose: () => void;
  onToggle: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (seconds: number) => void;
  onShuffle: () => void;
  onRepeat: () => void;
}) {
  const safeDuration = Math.max(duration || 0, 0);
  return (
    <section className={`now-playing cover-${track.artworkSeed % 8}`} role="dialog" aria-modal="true" aria-label="Now playing">
      <div className="now-playing-wash" />
      <header className="player-header">
        <button onClick={onClose} aria-label="Minimize player"><ChevronDown /></button>
        <div><span>Now playing</span><strong>From your Telegram library</strong></div>
        <span className="queue-count">{queuePosition}/{queueLength}</span>
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
          <button className="player-main-control" onClick={onToggle} aria-label={isPlaying ? "Pause" : "Play"}>
            {isPlaying ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
          </button>
          <button onClick={onNext} aria-label="Next track"><SkipForward fill="currentColor" /></button>
          <button className={repeatOne ? "active" : ""} onClick={onRepeat} aria-label="Repeat track"><Repeat2 /></button>
        </div>
        <div className="streaming-badge"><span /><strong>Streaming securely</strong> from Telegram</div>
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

function TrackSheet({
  track,
  playlists,
  currentPlaylist,
  busy,
  onClose,
  onPlayNow,
  onSendTelegram,
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
  onAdd: (playlistId: string, trackId: string) => void;
  onRemove?: () => void;
  onNewPlaylist: () => void;
}) {
  return (
    <Sheet onClose={onClose} title={`Options for ${track.title}`}>
      <div className="sheet-track">
        <Cover seed={track.artworkSeed} size="medium" label={track.title} artworkUrl={track.artworkUrl} />
        <div><h2>{track.title}</h2><p>{track.artist}</p></div>
        <button className="icon-button" onClick={onClose}><X /></button>
      </div>
      <button className="sheet-action play-now-action" onClick={onPlayNow} disabled={busy || !track.playable}><span><Play fill="currentColor" /></span><div><strong>Play now</strong><small>Listen here with full controls</small></div><ChevronRight /></button>
      <button className="sheet-action" onClick={onSendTelegram} disabled={busy}><span><Send /></span><div><strong>Send to Telegram player</strong><small>Play it as an audio message in chat</small></div><ChevronRight /></button>
      {onRemove ? <button className="sheet-action danger-action" onClick={onRemove} disabled={busy}><span><X /></span><div><strong>Remove from {currentPlaylist?.name}</strong><small>The song stays in your library</small></div><ChevronRight /></button> : null}
      <div className="sheet-divider" />
      <div className="sheet-subheading"><span>Add to playlist</span><button onClick={onNewPlaylist}><Plus /> New</button></div>
      <div className="playlist-options">
        {playlists.length ? playlists.map((playlist) => {
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
