"use client";

import { useRef, useState, useTransition } from "react";

import { Icon } from "@/components/ui/Icon";
import { TextArea } from "@/components/ui/TextArea";
import { cn } from "@/lib/cn";
import { uploadImage } from "@/lib/actions/uploads";
import {
  ACCEPT_ATTRIBUTE,
  MAX_UPLOAD_BYTES,
  formatBytes,
} from "@/lib/uploads/config";
import { useFileDrop } from "@/lib/hooks/useFileDrop";

/**
 * Gallery field: upload several images at once, reorder-free list with
 * per-image removal, and a textarea escape hatch for pasting URLs.
 *
 * Uploads run sequentially rather than in parallel — a handful of 5 MB files
 * fired at once would compete for the same request budget and make failures
 * harder to attribute.
 */
export function GalleryUploadField({
  name,
  urls,
  onChange,
  error,
}: {
  name: string;
  urls: string[];
  onChange: (urls: string[]) => void;
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const uploadAll = (files: File[]) => {
    setUploadError(null);

    startTransition(async () => {
      const added: string[] = [];

      for (const [index, file] of files.entries()) {
        setProgress(`Uploading ${index + 1} of ${files.length}…`);

        if (file.size > MAX_UPLOAD_BYTES) {
          setUploadError(
            `${file.name} is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`,
          );
          continue;
        }

        const body = new FormData();
        body.append("file", file);
        const result = await uploadImage(body);

        if (result.ok) added.push(result.url);
        else setUploadError(result.error);
      }

      setProgress(null);
      if (added.length > 0) onChange([...urls, ...added]);
    });
  };

  const { dragging, dropProps } = useFileDrop({
    onFiles: uploadAll,
    // Dragged from another tab: no bytes to upload, just an address to append.
    onUrl: (url) => onChange([...urls, url]),
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-on-surface text-sm font-medium">Gallery images</p>
            <p className="text-on-surface-variant mt-0.5 text-xs">
              {urls.length} image{urls.length === 1 ? "" : "s"} · drag several here at once
            </p>
          </div>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={pending}
            className="border-outline text-primary state-layer inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 disabled:opacity-60"
          >
            {pending ? (
              <>
                <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                {progress ?? "Uploading…"}
              </>
            ) : (
              <>
                <Icon name="add_photo_alternate" size={18} />
                Add images
              </>
            )}
          </button>
        </div>

        {urls.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {urls.map((url, index) => (
              <li key={`${url}-${index}`} className="group relative">
                <div className="bg-surface-container-highest border-outline-variant size-20 overflow-hidden rounded-md border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="size-full object-cover" />
                </div>
                <button
                  type="button"
                  aria-label={`Remove image ${index + 1}`}
                  onClick={() => onChange(urls.filter((_, i) => i !== index))}
                  className="bg-error text-on-error absolute -top-1.5 -right-1.5 grid size-6 place-items-center rounded-full opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2"
                >
                  <Icon name="close" size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          multiple
          className="sr-only"
          aria-label="Upload gallery images"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0) uploadAll(files);
            e.target.value = "";
          }}
        />
      </div>

      {uploadError && (
        <p role="alert" className="text-error px-1 text-xs">
          {uploadError}
        </p>
      )}

      {/* Submitted value; editable directly for pasting remote URLs. */}
      <TextArea
        label="Gallery image URLs"
        name={name}
        value={urls.join("\n")}
        onChange={(e) =>
          onChange(e.target.value.split("\n").map((line) => line.trim()).filter(Boolean))
        }
        rows={3}
        supportingText="One URL per line — uploads are added here automatically"
        error={error}
      />
    </div>
  );
}
