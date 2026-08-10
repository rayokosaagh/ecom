"use server";

import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { requireAdmin, requireUser } from "@/lib/auth/dal";
import { hasAnyOrder } from "@/lib/reviews/service";
import {
  ACCEPTED_IMAGE_TYPES,
  ACCEPTED_VIDEO_TYPES,
  MAX_AVATAR_BYTES,
  MAX_UPLOAD_BYTES,
  MAX_VIDEO_BYTES,
  UPLOAD_URL_PREFIX,
  formatBytes,
  type AcceptedImageType,
  type AcceptedVideoType,
} from "@/lib/uploads/config";

export type UploadResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

/**
 * Identify an image from its leading bytes.
 *
 * The browser-reported `file.type` is attacker-controlled, so it is never
 * trusted on its own — a .exe renamed to .png would otherwise land in a
 * publicly served directory.
 */
function sniffImageType(bytes: Uint8Array): AcceptedImageType | null {
  const startsWith = (...sig: number[]) =>
    sig.every((byte, index) => bytes[index] === byte);

  if (startsWith(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (startsWith(0x47, 0x49, 0x46, 0x38)) return "image/gif";

  // RIFF....WEBP
  if (
    startsWith(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  // ....ftypavif
  const brand = String.fromCharCode(...bytes.slice(4, 12));
  if (brand === "ftypavif") return "image/avif";

  return null;
}

/**
 * Identify a video container from its leading bytes.
 *
 * Same reasoning as the image sniffer, and the stakes are the same: the
 * extension we write is derived from what the bytes actually are, and the
 * static server picks the Content-Type from that extension. Get this wrong and
 * a file could be served as something the browser will execute.
 */
function sniffVideoType(bytes: Uint8Array): AcceptedVideoType | null {
  // WebM/Matroska: EBML header.
  if (
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return "video/webm";
  }

  // ISO base media (MP4 and friends): a `ftyp` box at offset 4. The brand that
  // follows says which flavour; `qt  ` is QuickTime, which we do not accept
  // even though it shares the container.
  const boxType = String.fromCharCode(...bytes.slice(4, 8));
  if (boxType === "ftyp") {
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    const accepted = ["isom", "iso2", "mp41", "mp42", "avc1", "dash", "M4V "];
    if (accepted.includes(brand)) return "video/mp4";
  }

  return null;
}

/** Write bytes under a generated name and return the URL they are served at. */
async function store(buffer: Buffer, extension: string): Promise<string> {
  // Filename is generated, never taken from the client — no path traversal,
  // no collisions, no surprising extensions.
  const filename = `${Date.now().toString(36)}-${randomBytes(8).toString("hex")}.${extension}`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, filename), buffer);
  return `${UPLOAD_URL_PREFIX}${filename}`;
}

/**
 * Store an image or video attached to a review.
 *
 * The one upload path open to people who are not administrators, so the gate
 * matters more here than anywhere else in the app. Three things hold it:
 *
 *  - the author must be a customer who has completed an order, the same bar as
 *    writing the review itself;
 *  - the bytes are sniffed, so the browser's claimed type buys nothing, and
 *    the extension written to disk comes from what the file actually is;
 *  - nothing SVG-shaped is accepted, because an SVG is a document that can
 *    carry script and this directory is served as static files.
 *
 * What this does NOT do is bound total disk use per account. Every accepted
 * file is capped individually and a review can carry only a few, but a
 * determined customer could still upload repeatedly. On a real deployment this
 * belongs behind object storage with a quota rather than the local filesystem.
 */
export async function uploadReviewMedia(formData: FormData): Promise<UploadResult> {
  const user = await requireUser();

  if (!(await hasAnyOrder(user.id))) {
    return { ok: false, error: "Only customers who have ordered can attach media." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No file selected." };
  }

  // Read the head first so an oversized file is rejected on the declared size
  // before its bytes are pulled into memory in full.
  const isVideoByClaim = file.type.startsWith("video/");
  const limit = isVideoByClaim ? MAX_VIDEO_BYTES : MAX_UPLOAD_BYTES;
  if (file.size > limit) {
    return {
      ok: false,
      error: `That file is ${formatBytes(file.size)} — the limit is ${formatBytes(limit)}.`,
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const video = sniffVideoType(buffer);
  if (video) {
    // Re-checked against the video limit now that the type is known, in case
    // the claimed type was an image and the bytes say otherwise.
    if (buffer.length > MAX_VIDEO_BYTES) {
      return {
        ok: false,
        error: `That video is ${formatBytes(buffer.length)} — the limit is ${formatBytes(MAX_VIDEO_BYTES)}.`,
      };
    }
    return { ok: true, url: await store(buffer, ACCEPTED_VIDEO_TYPES[video]) };
  }

  const image = sniffImageType(buffer);
  if (image) {
    if (buffer.length > MAX_UPLOAD_BYTES) {
      return {
        ok: false,
        error: `That image is ${formatBytes(buffer.length)} — the limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`,
      };
    }
    return { ok: true, url: await store(buffer, ACCEPTED_IMAGE_TYPES[image]) };
  }

  return {
    ok: false,
    error: "That is not a supported photo (JPEG, PNG, WebP, GIF, AVIF) or video (MP4, WebM).",
  };
}

/**
 * The image half of an upload, minus the question of who is allowed to do it.
 *
 * Shared so the admin path and the avatar path cannot drift on the part that
 * matters — which bytes are accepted and what extension they are written
 * under. The two differ only in their gate and their ceiling, and both of
 * those stay with the caller, where they can be read.
 *
 * The size is checked twice: once on what the browser declares, so an
 * oversized file is refused before its bytes are pulled into memory, and again
 * on what actually arrived, because the declared size is no more trustworthy
 * than the declared type.
 */
async function acceptImage(
  value: FormDataEntryValue | null,
  limit: number,
): Promise<UploadResult> {
  if (!(value instanceof File) || value.size === 0) {
    return { ok: false, error: "No file selected." };
  }

  const tooBig = (size: number): UploadResult => ({
    ok: false,
    error: `That file is ${formatBytes(size)} — the limit is ${formatBytes(limit)}.`,
  });

  if (value.size > limit) return tooBig(value.size);

  const buffer = Buffer.from(await value.arrayBuffer());
  if (buffer.length > limit) return tooBig(buffer.length);

  const detected = sniffImageType(buffer);
  if (!detected) {
    return {
      ok: false,
      error: "That does not look like a supported image (JPEG, PNG, WebP, GIF or AVIF).",
    };
  }

  return { ok: true, url: await store(buffer, ACCEPTED_IMAGE_TYPES[detected]) };
}

/**
 * Store an uploaded image and return the URL to reference it by.
 *
 * Admin-only. Files are written to `public/uploads`, which means they are
 * served straight off the local filesystem — fine for a single server, but on
 * a serverless host the directory is read-only and ephemeral. Swapping this
 * one function for an S3/R2 put is all that is needed to move off local disk.
 */
export async function uploadImage(formData: FormData): Promise<UploadResult> {
  await requireAdmin();
  return acceptImage(formData.get("file"), MAX_UPLOAD_BYTES);
}

/**
 * Store a profile picture for whoever is signed in.
 *
 * A separate action from `uploadImage` rather than a relaxed gate on it: that
 * one is admin-only, and the difference between "an administrator may write a
 * file to the public directory" and "anyone with an account may" is worth
 * being able to see at the call site.
 *
 * The URL is returned, not saved — `updateProfile` is what writes it to the
 * account, and it re-checks the value it is given. An upload that the shopper
 * abandons without saving is therefore just an orphaned file, not a change to
 * anything.
 *
 * Like the other two paths, this does not bound total disk use per account:
 * every file is capped individually, but somebody could still replace their
 * avatar repeatedly, and the file it replaced is left behind. On a real
 * deployment this belongs behind object storage with a quota and a lifecycle
 * rule rather than the local filesystem.
 */
export async function uploadAvatar(formData: FormData): Promise<UploadResult> {
  await requireUser();
  return acceptImage(formData.get("file"), MAX_AVATAR_BYTES);
}
