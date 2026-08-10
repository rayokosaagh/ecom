/** Shared by the upload action and the client field, so limits cannot drift. */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Tighter cap for a profile picture.
 *
 * Avatars are the one image path open to every signed-in account rather than
 * to administrators, so the ceiling is lower on purpose. Nothing is lost by it:
 * the largest an avatar is ever drawn is 96px, which 2 MB covers many times
 * over even before the browser scales it down.
 */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB

/** Extension is derived from the sniffed type, never from the client filename. */
export const ACCEPTED_IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
} as const;

export type AcceptedImageType = keyof typeof ACCEPTED_IMAGE_TYPES;

/** For the file input's `accept` attribute. */
export const ACCEPT_ATTRIBUTE = Object.keys(ACCEPTED_IMAGE_TYPES).join(",");

/**
 * Video, for customer review attachments.
 *
 * Two containers only. Every additional format is another parser to be sure
 * about, and these two cover what phones record and what browsers play without
 * a plugin. Notably absent: anything SVG-shaped — an SVG is a document that can
 * carry script, and it has no business in a directory served as static files.
 */
export const ACCEPTED_VIDEO_TYPES = {
  "video/mp4": "mp4",
  "video/webm": "webm",
} as const;

export type AcceptedVideoType = keyof typeof ACCEPTED_VIDEO_TYPES;

export const ACCEPT_MEDIA_ATTRIBUTE = [
  ...Object.keys(ACCEPTED_IMAGE_TYPES),
  ...Object.keys(ACCEPTED_VIDEO_TYPES),
].join(",");

/** Video is bigger by nature, but not unboundedly so. */
export const MAX_VIDEO_BYTES = 20 * 1024 * 1024; // 20 MB

/** How many attachments one review may carry. */
export const MAX_REVIEW_MEDIA = 6;

/** Public URL prefix that uploaded files are served from. */
export const UPLOAD_URL_PREFIX = "/uploads/";

/**
 * The exact shape of a URL this app generates.
 *
 * A review submits the URLs its attachments live at, and a form is not to be
 * trusted about that: without this, a crafted submission could point an
 * attachment at any URL on the internet, turning a review into an embed of
 * whatever the author liked. Anchored at both ends, so `/uploads/x.png?a=b` and
 * `https://evil/uploads/x.png` both fail.
 */
export const UPLOADED_URL_PATTERN = new RegExp(
  // `\\.` and not `\.`: this is a template literal, where `\.` collapses to a
  // bare `.` and the separator would then match any character at all.
  `^${UPLOAD_URL_PREFIX}[a-z0-9]+-[0-9a-f]{16}\\.(?:${[
    ...Object.values(ACCEPTED_IMAGE_TYPES),
    ...Object.values(ACCEPTED_VIDEO_TYPES),
  ].join("|")})$`,
);

export function isUploadedUrl(value: string): boolean {
  return UPLOADED_URL_PATTERN.test(value);
}

/** Which of the two kinds a stored URL is, by the extension we gave it. */
export function mediaKindFor(url: string): "IMAGE" | "VIDEO" | null {
  if (!isUploadedUrl(url)) return null;
  const extension = url.slice(url.lastIndexOf(".") + 1);
  return (Object.values(ACCEPTED_VIDEO_TYPES) as string[]).includes(extension)
    ? "VIDEO"
    : "IMAGE";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
