"use client";

import { useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { uploadReviewMedia } from "@/lib/actions/uploads";
import {
  ACCEPT_MEDIA_ATTRIBUTE,
  MAX_REVIEW_MEDIA,
  MAX_UPLOAD_BYTES,
  MAX_VIDEO_BYTES,
  formatBytes,
  mediaKindFor,
} from "@/lib/uploads/config";

export type ReviewMediaItem = { url: string; kind: "IMAGE" | "VIDEO" };

/**
 * Photo and clip picker for a review.
 *
 * Files are uploaded as they are chosen rather than with the form, so the
 * author sees whether each one was accepted while they are still writing —
 * finding out that a 40 MB video was refused *after* submitting would mean
 * retyping the review.
 *
 * The accepted URLs ride along as hidden inputs, and the server re-validates
 * every one of them: this component decides what to show, not what is allowed.
 */
export function ReviewMediaField({
  value,
  onChange,
}: {
  value: ReviewMediaItem[];
  onChange: (next: ReviewMediaItem[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string>();

  const remaining = MAX_REVIEW_MEDIA - value.length;

  const pick = async (files: FileList) => {
    setError(undefined);

    // Trimmed here so choosing ten files does not upload ten and then discard
    // four — the ones over the cap are never sent.
    const chosen = Array.from(files).slice(0, remaining);
    if (files.length > chosen.length) {
      setError(`Up to ${MAX_REVIEW_MEDIA} attachments — the rest were skipped.`);
    }

    const accepted: ReviewMediaItem[] = [];
    for (const file of chosen) {
      setBusy((n) => n + 1);
      try {
        const data = new FormData();
        data.set("file", file);
        const result = await uploadReviewMedia(data);
        if (result.ok) {
          const kind = mediaKindFor(result.url);
          if (kind) accepted.push({ url: result.url, kind });
        } else {
          setError(result.error);
        }
      } finally {
        setBusy((n) => n - 1);
      }
    }

    if (accepted.length > 0) onChange([...value, ...accepted]);
    // Clearing lets the same file be picked again after being removed.
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div>
      <p className="text-on-surface-variant mb-1 text-sm">
        Photos or clips <span className="opacity-60">(optional)</span>
      </p>

      {value.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2">
          {value.map((item) => (
            <li key={item.url} className="relative">
              <span className="bg-surface-container-highest block size-20 overflow-hidden rounded-lg">
                {item.kind === "VIDEO" ? (
                  // `muted` + `playsInline` so a thumbnail cannot start making
                  // noise on its own; the full clip plays in the review list.
                  <video
                    src={item.url}
                    muted
                    playsInline
                    preload="metadata"
                    className="size-full object-cover"
                  />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={item.url} alt="" className="size-full object-cover" />
                )}
              </span>

              {item.kind === "VIDEO" && (
                <span
                  aria-hidden
                  className="text-on-surface pointer-events-none absolute inset-0 grid place-items-center"
                >
                  <Icon name="play_circle" size={24} filled />
                </span>
              )}

              <button
                type="button"
                aria-label="Remove attachment"
                onClick={() => onChange(value.filter((v) => v.url !== item.url))}
                className="bg-surface-container-highest text-on-surface hover:bg-error hover:text-on-error absolute -top-1.5 -right-1.5 grid size-6 place-items-center rounded-full shadow-elevation-1 transition-colors duration-150 focus-visible:outline-2"
              >
                <Icon name="close" size={14} />
              </button>

              {/* Submitted with the form; the server checks each URL is one it
                  issued before it goes anywhere near the database. */}
              <input type="hidden" name="media" value={item.url} />
            </li>
          ))}
        </ul>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_MEDIA_ATTRIBUTE}
        multiple
        className="sr-only"
        onChange={(event) => {
          if (event.target.files?.length) void pick(event.target.files);
        }}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy > 0 || remaining <= 0}
          onClick={() => inputRef.current?.click()}
          className="border-outline text-on-surface hover:bg-on-surface/[0.06] inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
        >
          {busy > 0 ? (
            <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <Icon name="add_photo_alternate" size={18} />
          )}
          {busy > 0 ? "Uploading…" : "Add photos or a clip"}
        </button>

        <span className="text-on-surface-variant text-xs">
          {remaining > 0
            ? `${remaining} left · images to ${formatBytes(MAX_UPLOAD_BYTES)}, video to ${formatBytes(MAX_VIDEO_BYTES)}`
            : `That is all ${MAX_REVIEW_MEDIA}`}
        </span>
      </div>

      {error && (
        <p role="alert" className="text-error mt-2 text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
