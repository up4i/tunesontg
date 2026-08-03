export type Track = {
  id: string;
  title: string;
  artist: string;
  duration: number;
  mimeType: string | null;
  fileSize: number | null;
  addedAt: string;
  artworkSeed: number;
};

export type Playlist = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  trackCount: number;
  duration: number;
  tracks: Track[];
};

export type LibraryPayload = {
  user: {
    firstName: string;
    username: string | null;
  };
  tracks: Track[];
  playlists: Playlist[];
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
