"use client";

import { useRef, useState, useTransition } from "react";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { uploadAvatar } from "@/lib/actions/uploads";
import {
  ACCEPT_ATTRIBUTE,
  MAX_AVATAR_BYTES,
  formatBytes,
} from "@/lib/uploads/config";
import { useFileDrop } from "@/lib/hooks/useFileDrop";

/**
 * The profile picture control.
 *
 * A sibling of `ImageUploadField` rather than a reuse of it. That one is built
 * for the admin forms: it is square, it calls the admin-only `uploadImage`
 * (which would bounce a shopper to /forbidden), and it puts a URL box on the
 * page because an administrator pasting a supplier's image address is a normal
 * thing to do. None of the three is true here.
 *
 * The committed value is a string in a hidden input, so the surrounding form
 * submits it exactly like the text field it replaced — an upload, a dragged
 * address and an untouched existing value are all just a string by the time
 * `updateProfile` reads them, and it re-checks whichever arrives.
 */
export function AvatarField({
  name,
  value,
  onChange,
  /** Drawn when there is no picture — the initial the rest of the app uses. */
  fallback,
  error,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  fallback: string;
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [uploadError, setUploadError] = useState<string | null>(null);

  const upload = (file: File) => {
    setUploadError(null);

    // Checked here too, so an oversized photo never leaves the browser.
    if (file.size > MAX_AVATAR_BYTES) {
      setUploadError(
        `That photo is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_AVATAR_BYTES)}.`,
      );
      return;
    }

    startTransition(async () => {
      const body = new FormData();
      body.append("file", file);
      const result = await uploadAvatar(body);
      if (result.ok) onChange(result.url);
      else setUploadError(result.error);
    });
  };

  const { dragging, dropProps } = useFileDrop({
    onFiles: (files) => upload(files[0]),
    // A picture dragged out of another tab arrives as an address with no bytes
    // behind it, and an address is already a value this field accepts.
    onUrl: onChange,
  });

  return (
    <div className="space-y-3">
      <div
        {...dropProps}
        className={cn(
          "flex flex-wrap items-center gap-5 rounded-xl border-2 border-dashed p-4",
          "transition-colors duration-200",
          dragging ? "border-primary bg-primary/[0.06]" : "border-outline-variant",
        )}
      >
        <div
          className={cn(
            "bg-primary-container text-on-primary-container relative grid size-24 shrink-0",
            "place-items-center overflow-hidden rounded-full text-3xl font-medium",
          )}
        >
          {value ? (
            /* A plain <img>: the address can be any host a shopper pasted, and
               next/image would need every one of them in remotePatterns. */
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={value} alt="" className="size-full object-cover" />
          ) : (
            <span aria-hidden>{fallback}</span>
          )}

          {pending && (
            <span className="absolute inset-0 grid place-items-center bg-black/40">
              <span className="size-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-on-surface text-sm font-medium">Profile picture</p>
          <p className="text-on-surface-variant mt-0.5 text-xs">
            Drag a photo here, or choose one. JPEG, PNG, WebP, GIF or AVIF, up to{" "}
            {formatBytes(MAX_AVATAR_BYTES)}.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={pending}
              className="border-outline text-primary state-layer inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 disabled:opacity-60"
            >
              <Icon name={pending ? "hourglass_top" : "photo_camera"} size={18} />
              {pending ? "Uploading…" : value ? "Change photo" : "Upload photo"}
            </button>

            {value && !pending && (
              <button
                type="button"
                onClick={() => {
                  setUploadError(null);
                  onChange("");
                }}
                className="text-on-surface-variant state-layer inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <Icon name="delete" size={18} />
                Remove
              </button>
            )}
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          aria-label="Upload a profile picture"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) upload(file);
            // Reset so re-picking the same file fires change again.
            event.target.value = "";
          }}
        />
      </div>

      {/* The upload's own failures and the form's rejection of the value are
          different things and can both be true, so neither replaces the other. */}
      {uploadError && (
        <p role="alert" className="text-error px-1 text-xs">
          {uploadError}
        </p>
      )}
      {error && (
        <p role="alert" className="text-error px-1 text-xs">
          {error}
        </p>
      )}

      {/* What the form actually submits. */}
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
