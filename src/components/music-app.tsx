"use client";

import {
  ArrowLeft,
  Check,
  ChevronRight,
  House,
  Inbox,
  Library,
  ListMusic,
  ListPlus,
  LoaderCircle,
  MoreHorizontal,
  Music2,
  Play,
  Plus,
  Search,
  Send,
  Shuffle,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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

function Cover({ seed, size = "medium", label }: { seed: number; size?: "small" | "medium" | "large"; label: string }) {
  return (
    <div className={`cover cover-${seed % 8} cover-${size}`} aria-label={`${label} artwork`}>
      <div className="cover-orbit" />
      <Music2 aria-hidden="true" />
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
        <div className={`playlist-tile cover-${track ? track.artworkSeed % 8 : (index + 2) % 8}`} key={track?.id ?? index}>
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
      <button className="track-main" onClick={onPlay} aria-label={`Send ${track.title} to Telegram`}>
        {ordinal ? <span className="track-number">{ordinal}</span> : <Cover seed={track.artworkSeed} size="small" label={track.title} />}
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
      webApp?.setHeaderColor("#11110f");
      webApp?.setBackgroundColor("#11110f");
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
  const filteredTracks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return library?.tracks ?? [];
    return (library?.tracks ?? []).filter((track) =>
      `${track.title} ${track.artist}`.toLocaleLowerCase().includes(query),
    );
  }, [library?.tracks, search]);

  function haptic(kind: "selection" | "success" | "error" = "selection") {
    const feedback = window.Telegram?.WebApp.HapticFeedback;
    if (kind === "selection") feedback?.selectionChanged();
    else feedback?.notificationOccurred(kind);
  }

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
    <div className="app-frame">
      {!library ? <Skeleton /> : (
        <>
          {tab === "home" ? (
            <HomeScreen
              library={library}
              onPlay={(track) => void sendQueue([track.id])}
              onMore={setTrackMenu}
              onPlaylist={(id) => { setSelectedPlaylistId(id); setTab("playlists"); }}
              onSeeLibrary={() => switchTab("library")}
              onShuffle={() => void sendQueue(library.tracks.map((track) => track.id), true)}
              sending={sending}
            />
          ) : null}
          {tab === "library" ? (
            <LibraryScreen
              tracks={filteredTracks}
              total={library.tracks.length}
              search={search}
              setSearch={setSearch}
              onPlay={(track) => void sendQueue([track.id])}
              onMore={setTrackMenu}
              onShuffle={() => void sendQueue(library.tracks.map((track) => track.id), true)}
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
              onPlay={() => void sendQueue(selectedPlaylist.tracks.map((track) => track.id))}
              onShuffle={() => void sendQueue(selectedPlaylist.tracks.map((track) => track.id), true)}
              onTrackPlay={(track) => void sendQueue([track.id])}
              onMore={setTrackMenu}
              sending={sending}
            />
          ) : null}

          <BottomNav tab={tab} onSelect={switchTab} />
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
          onPlay={() => { setTrackMenu(null); void sendQueue([trackMenu.id]); }}
          onAdd={addToPlaylist}
          onRemove={selectedPlaylist ? () => void removeFromPlaylist(selectedPlaylist.id, trackMenu.id) : undefined}
          onNewPlaylist={() => { setTrackMenu(null); setCreateOpen(true); }}
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
        <div><strong>Plays in Telegram</strong><p>Your audio stays on Telegram. We only organize file references.</p></div>
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
  onPlay,
  onAdd,
  onRemove,
  onNewPlaylist,
}: {
  track: Track;
  playlists: Playlist[];
  currentPlaylist: Playlist | null;
  busy: boolean;
  onClose: () => void;
  onPlay: () => void;
  onAdd: (playlistId: string, trackId: string) => void;
  onRemove?: () => void;
  onNewPlaylist: () => void;
}) {
  return (
    <Sheet onClose={onClose} title={`Options for ${track.title}`}>
      <div className="sheet-track">
        <Cover seed={track.artworkSeed} size="medium" label={track.title} />
        <div><h2>{track.title}</h2><p>{track.artist}</p></div>
        <button className="icon-button" onClick={onClose}><X /></button>
      </div>
      <button className="sheet-action" onClick={onPlay} disabled={busy}><span><Send /></span><div><strong>Play in Telegram</strong><small>Send this track to the native player</small></div><ChevronRight /></button>
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
