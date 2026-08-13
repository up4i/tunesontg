export type Track = {
  id: string;
  title: string;
  artist: string;
  duration: number;
  mimeType: string | null;
  fileSize: number | null;
  addedAt: string;
  artworkSeed: number;
  artworkRevision: string;
  hasArtwork: boolean;
  hasCustomArtwork: boolean;
  playable: boolean;
  liked: boolean;
  streamUrl?: string;
  artworkUrl?: string;
};

export type Playlist = {
  id: string;
  name: string;
  description: string;
  coverSeed: number | null;
  coverImage: string | null;
  kind: "standard" | "liked";
  visibility: "private" | "public";
  createdAt: string;
  trackCount: number;
  duration: number;
  tracks: Track[];
};

export type SharedSongPreview = {
  type: "song";
  shareId: string;
  title: string;
  artist: string;
  duration: number;
  artworkSeed: number;
  ownerName: string;
  alreadyAdded: boolean;
  libraryTrackId: string | null;
};

export type SharedPlaylistPreview = {
  type: "playlist";
  shareId: string;
  name: string;
  description: string;
  coverSeed: number | null;
  coverImage: string | null;
  ownerName: string;
  trackCount: number;
  duration: number;
  alreadyAdded: boolean;
  tracks: Array<Pick<Track, "title" | "artist" | "duration" | "artworkSeed">>;
};

export type SharedPreview = SharedSongPreview | SharedPlaylistPreview;

export type LibraryPayload = {
  user: {
    firstName: string;
    username: string | null;
    photoUrl: string | null;
  };
  tracks: Track[];
  recentlyPlayed: Track[];
  playlists: Playlist[];
  playbackSummary: {
    starts: number;
    errors: number;
    stalls: number;
    recoveredRetries: number;
    averageStartupMs: number | null;
  };
  importSummary: {
    imported: number;
    duplicates: number;
    failed: number;
  };
  demo: boolean;
};

export type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
};
