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
  owned: boolean;
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
  access: "owner" | "collaborator";
  ownerName: string;
  collaborative: boolean;
  folderId: string | null;
  followerCount: number;
  collaboratorCount: number;
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

export type PlaylistFolder = {
  id: string;
  name: string;
  playlistCount: number;
};

export type FollowedPlaylist = {
  playlistId: string;
  shareId: string;
  name: string;
  description: string;
  coverSeed: number | null;
  coverImage: string | null;
  ownerName: string;
  trackCount: number;
  duration: number;
  collaborative: boolean;
  followedAt: string;
};

export type ActivityNotification = {
  id: string;
  playlistId: string;
  playlistName: string;
  message: string;
  read: boolean;
  createdAt: string;
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
  following: boolean;
  collaborative: boolean;
  isCollaborator: boolean;
  isOwner: boolean;
  followerCount: number;
  collaboratorCount: number;
  tracks: Array<Pick<Track, "title" | "artist" | "duration" | "artworkSeed">>;
};

export type SharedProfilePreview = {
  type: "profile";
  publicId: string;
  displayName: string;
  bio: string;
  photoUrl: string | null;
  playlists: Array<{
    shareId: string;
    name: string;
    description: string;
    coverSeed: number | null;
    coverImage: string | null;
    trackCount: number;
    duration: number;
    collaborative: boolean;
    followerCount: number;
  }>;
};

export type SharedPreview = SharedSongPreview | SharedPlaylistPreview | SharedProfilePreview;

export type LibraryPayload = {
  user: {
    firstName: string;
    displayName: string;
    bio: string;
    username: string | null;
    photoUrl: string | null;
    publicId: string;
    hasCustomPhoto: boolean;
  };
  tracks: Track[];
  recentlyPlayed: Track[];
  recommendations: Track[];
  playlists: Playlist[];
  playlistFolders: PlaylistFolder[];
  followedPlaylists: FollowedPlaylist[];
  notifications: ActivityNotification[];
  unreadNotifications: number;
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
