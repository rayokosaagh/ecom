"use client";

import { useRef, useState, useTransition } from "react";

import { Icon } from "@/components/ui/Icon";
import { TextField } from "@/components/ui/TextField";
import { cn } from "@/lib/cn";
import { uploadImage } from "@/lib/actions/uploads";
import {
  ACCEPT_ATTRIBUTE,
  MAX_UPLOAD_BYTES,
  formatBytes,
} from "@/lib/uploads/config";
import { useFileDrop } from "@/lib/hooks/useFileDrop";

/**
 * Single image field: upload from the device, or paste a URL.
 *
 * The committed value is always a string in the hidden input named `name`, so
 * the surrounding form does not care which route produced it.
 */
export function ImageUploadField({
  name,
  label,
  value,
  onChange,
  error,
  supportingText,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  supportingText?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [uploadError, setUploadError] = useState<string | null>(null);

  const upload = (file: File) => {
    setUploadError(null);

    // Checked here too so an oversized file never leaves the browser.
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(
        `That file is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`,
      );
      return;
    }

    startTransition(async () => {
      const body = new FormData();
      body.append("file", file);
      const result = await uploadImage(body);
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
          "rounded-xl border-2 border-dashed p-4 transition-colors duration-200",
          dragging ? "border-primary bg-primary/[0.06]" : "border-outline-variant",
        )}
      >
        <div className="flex flex-wrap items-center gap-4">
          <div className="bg-surface-container-highest size-24 shrink-0 overflow-hidden rounded-lg">
            {value ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={value} alt="" className="size-full object-cover" />
            ) : (
              <div className="text-on-surface-variant grid size-full place-items-center">
                <Icon name="image" size={28} />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-on-surface text-sm font-medium">{label}</p>
            <p className="text-on-surface-variant mt-0.5 text-xs">
              Drag an image here, or choose a file. Max {formatBytes(MAX_UPLOAD_BYTES)}.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={pending}
                className="border-outline text-primary state-layer inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 disabled:opacity-60"
              >
                {pending ? (
                  <>
                    <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <Icon name="upload" size={18} />
                    Choose file
                  </>
                )}
              </button>

              {value && (
                <button
                  type="button"
                  onClick={() => onChange("")}
                  className="text-on-surface-variant state-layer inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <Icon name="close" size={18} />
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          aria-label={`Upload ${label}`}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            // Reset so re-picking the same file fires change again.
            e.target.value = "";
          }}
        />
      </div>

      {uploadError && (
        <p role="alert" className="text-error px-1 text-xs">
          {uploadError}
        </p>
      )}

      {/* The value the form actually submits — also editable as a URL. */}
      <TextField
        label="…or paste an image URL"
        name={name}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        leadingIcon="link"
        error={error}
        supportingText={supportingText}
      />
    </div>
  );
}
