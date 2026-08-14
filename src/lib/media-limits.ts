export const MAX_TRACK_DURATION_SECONDS = 10 * 60;
export const MAX_TELEGRAM_DOWNLOAD_BYTES = 20 * 1024 * 1024;

export function formatUploadLimits(): string {
  return "10 minutes and 20 MB";
}
