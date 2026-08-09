"use client";

import { useRef, useState, useTransition } from "react";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { uploadImage } from "@/lib/actions/uploads";
import {
  MAX_COLORS,
  MAX_COLOR_GALLERY,
  normalizeHex,
  parseColorGallery,
} from "@/lib/products/colors";
import { ACCEPT_ATTRIBUTE, MAX_UPLOAD_BYTES, formatBytes } from "@/lib/uploads/config";
import { useFileDrop } from "@/lib/hooks/useFileDrop";

export interface ColorRow {
  name: string;
  hex: string;
  image: string;
  /** Extra shots of this finish, one URL per line — see `lib/products/colors`
      for why this one field is a string rather than an array. */
  gallery: string;
}

/**
 * A handful of sensible defaults. Purely a shortcut for the admin — any name
 * and any hex are accepted, these just save typing the common ones.
 */
const PRESETS: ReadonlyArray<{ name: string; hex: string }> = [
  { name: "Midnight Black", hex: "#1b1b1f" },
  { name: "Space Grey", hex: "#44474f" },
  { name: "Silver", hex: "#e3e2e8" },
  { name: "Starlight", hex: "#f5f4f9" },
  { name: "Sky Blue", hex: "#c2e7ff" },
  { name: "Cobalt", hex: "#0b57d0" },
  { name: "Forest", hex: "#146c2e" },
  { name: "Crimson", hex: "#8c1d18" },
];

const LINE_BREAK = String.fromCharCode(10);

const BLANK: ColorRow = { name: "", hex: "#1b1b1f", image: "", gallery: "" };

/**
 * Repeating colourway editor.
 *
 * Each row posts under a repeated field name (`colorName`, `colorHex`,
 * `colorImage`), so the three arrays arrive index-aligned on the server and no
 * client-side JSON serialisation is involved. Rows are rendered even when
 * empty, which is what makes "add another" work without JavaScript state
 * leaking into the submitted payload.
 */
export function ColorField({
  value,
  onChange,
  error,
}: {
  value: ColorRow[];
  onChange: (rows: ColorRow[]) => void;
  error?: string;
}) {
  const update = (index: number, patch: Partial<ColorRow>) => {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));
  const add = () => onChange([...value, { ...BLANK }]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-on-surface text-sm font-medium">Colourways</p>
          <p className="text-on-surface-variant text-xs">
            Shoppers pick by name. A colour with its own photos takes over the
            whole gallery when it is picked — so the page shows one product in
            one finish rather than a mixed set. Drop images straight onto a row:
            the first fills its main photo, the rest become extra shots.
          </p>
        </div>
      </div>

      {value.length > 0 && (
        <ul className="space-y-3">
          {value.map((row, index) => (
            <li key={index}>
              <ColorRowEditor
                row={row}
                index={index}
                onChange={(patch) => update(index, patch)}
                onRemove={() => remove(index)}
              />
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="text-error px-1 text-xs">
          {error}
        </p>
      )}

      {value.length < MAX_COLORS && (
        <button
          type="button"
          onClick={add}
          className="border-outline text-primary state-layer inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
        >
          <Icon name="add" size={18} />
          Add colour
        </button>
      )}
    </div>
  );
}

function ColorRowEditor({
  row,
  index,
  onChange,
  onRemove,
}: {
  row: ColorRow;
  index: number;
  onChange: (patch: Partial<ColorRow>) => void;
  onRemove: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [presetsOpen, setPresetsOpen] = useState(false);

  /**
   * @param target `primary` replaces the colour's headline shot; `gallery`
   *   appends to its extra shots; `auto` is what a drop uses — the two buttons
   *   say which slot they mean, but a file let go over the row does not, so it
   *   fills the main photo if that is still empty and joins the extra shots
   *   otherwise. Dropping several at once on an empty row does both: the first
   *   leads, the rest follow.
   */
  const upload = (files: FileList | File[], target: "primary" | "gallery" | "auto") => {
    setUploadError(null);

    const dropped = Array.from(files);
    if (dropped.length === 0) return;

    const existing = parseColorGallery(row.gallery);
    const leads = target === "primary" || (target === "auto" && !row.image);

    const primaryFile = leads ? dropped[0] : null;
    const room = Math.max(MAX_COLOR_GALLERY - existing.length, 0);
    const galleryFiles =
      target === "primary" ? [] : dropped.slice(primaryFile ? 1 : 0).slice(0, room);

    if (!primaryFile && galleryFiles.length === 0) {
      setUploadError(`That colour already has ${MAX_COLOR_GALLERY} extra photos.`);
      return;
    }

    startTransition(async () => {
      const send = async (file: File) => {
        if (file.size > MAX_UPLOAD_BYTES) {
          setUploadError(
            `${file.name} is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`,
          );
          return null;
        }
        const body = new FormData();
        body.append("file", file);
        const result = await uploadImage(body);
        if (result.ok) return result.url;
        setUploadError(result.error);
        return null;
      };

      const patch: Partial<ColorRow> = {};

      if (primaryFile) {
        const url = await send(primaryFile);
        if (url) patch.image = url;
      }

      const added: string[] = [];
      for (const file of galleryFiles) {
        const url = await send(file);
        if (url) added.push(url);
      }
      if (added.length > 0) patch.gallery = [...existing, ...added].join(LINE_BREAK);

      // One patch rather than two: `onChange` merges into the row held by the
      // parent, and two calls in the same tick would both read the pre-upload
      // row, so the second would overwrite the first.
      if (Object.keys(patch).length > 0) onChange(patch);
    });
  };

  const { dragging, dropProps } = useFileDrop({
    onFiles: (files) => upload(files, "auto"),
    // An image dragged from another tab has no file behind it, only an
    // address — which is exactly what this row stores anyway.
    onUrl: (url) => onChange(row.image ? { gallery: appendGallery(url) } : { image: url }),
  });

  const appendGallery = (url: string) => {
    const existing = parseColorGallery(row.gallery);
    return existing.length < MAX_COLOR_GALLERY
      ? [...existing, url].join(LINE_BREAK)
      : row.gallery;
  };

  return (
    <div
      {...dropProps}
      className={cn(
        "rounded-xl border p-3 transition-colors duration-200",
        dragging
          ? "border-primary bg-primary/[0.06] border-dashed"
          : "border-outline-variant",
      )}
    >
      <div className="flex flex-wrap items-start gap-3">
        {/* Colour photo. Fixed square so every row lines up regardless of the
            source image's aspect ratio. */}
        <div className="bg-surface-container-highest relative size-16 shrink-0 overflow-hidden rounded-lg">
          {row.image ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={row.image} alt="" className="size-full object-cover" />
          ) : (
            <div className="text-on-surface-variant grid size-full place-items-center">
              <Icon name="image" size={20} />
            </div>
          )}
        </div>

        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <label className="sr-only" htmlFor={`color-name-${index}`}>
              Colour name
            </label>
            <input
              id={`color-name-${index}`}
              name="colorName"
              value={row.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="Colour name, e.g. Midnight Black"
              maxLength={40}
              className="border-outline text-on-surface placeholder:text-on-surface-variant focus:border-primary h-10 w-full rounded-sm border bg-transparent px-3 text-sm outline-none transition-colors duration-200"
            />
          </div>

          <div className="flex items-center gap-2">
            {/* Native colour input for picking, plus the hex as text so a
                brand value can be pasted exactly. */}
            <input
              type="color"
              aria-label={`Swatch for colour ${index + 1}`}
              value={normalizeHex(row.hex) || "#000000"}
              onChange={(e) => onChange({ hex: e.target.value })}
              className="border-outline size-10 shrink-0 cursor-pointer rounded-sm border bg-transparent p-1"
            />
            <input
              name="colorHex"
              value={row.hex}
              onChange={(e) => onChange({ hex: e.target.value })}
              placeholder="#1b1b1f"
              spellCheck={false}
              aria-label={`Hex value for colour ${index + 1}`}
              className="border-outline text-on-surface placeholder:text-on-surface-variant focus:border-primary h-10 w-24 rounded-sm border bg-transparent px-2 font-mono text-xs outline-none transition-colors duration-200"
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setPresetsOpen((v) => !v)}
            aria-expanded={presetsOpen}
            aria-label="Choose a preset colour"
            className="text-on-surface-variant hover:bg-on-surface/[0.08] grid size-9 place-items-center rounded-full transition-colors duration-200 focus-visible:outline-2"
          >
            <Icon name="palette" size={18} />
          </button>
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            disabled={pending}
            aria-label={`Upload extra photos for colour ${index + 1}`}
            title="Extra photos of this finish"
            className="text-on-surface-variant hover:bg-on-surface/[0.08] grid size-9 place-items-center rounded-full transition-colors duration-200 focus-visible:outline-2 disabled:opacity-50"
          >
            <Icon name="collections" size={18} />
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={pending}
            aria-label={`Upload the main photo for colour ${index + 1}`}
            title="Main photo for this finish"
            className="text-on-surface-variant hover:bg-on-surface/[0.08] grid size-9 place-items-center rounded-full transition-colors duration-200 focus-visible:outline-2 disabled:opacity-50"
          >
            {pending ? (
              <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Icon name="add_photo_alternate" size={18} />
            )}
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove colour ${index + 1}`}
            className="text-error hover:bg-error/[0.08] grid size-9 place-items-center rounded-full transition-colors duration-200 focus-visible:outline-2"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
      </div>

      {/* The photo URL travels with the row, and stays editable by hand. */}
      <input
        name="colorImage"
        value={row.image}
        onChange={(e) => onChange({ image: e.target.value })}
        placeholder="Photo URL for this colour (optional)"
        aria-label={`Photo URL for colour ${index + 1}`}
        className="border-outline text-on-surface placeholder:text-on-surface-variant focus:border-primary mt-2 h-9 w-full rounded-sm border bg-transparent px-3 text-xs outline-none transition-colors duration-200"
      />

      {/* Extra shots of the same finish, one URL per line. A textarea rather
          than repeated inputs because a row holds a list and repeated fields
          carry no row boundaries — see `lib/products/colors`. */}
      <textarea
        name="colorGallery"
        value={row.gallery}
        onChange={(e) => onChange({ gallery: e.target.value })}
        rows={row.gallery ? Math.min(parseColorGallery(row.gallery).length + 1, 5) : 1}
        placeholder={`Extra photos of this finish, one URL per line (up to ${MAX_COLOR_GALLERY})`}
        aria-label={`Extra photo URLs for colour ${index + 1}`}
        className="border-outline text-on-surface placeholder:text-on-surface-variant focus:border-primary mt-2 w-full resize-y rounded-sm border bg-transparent px-3 py-2 font-mono text-xs outline-none transition-colors duration-200"
      />

      {parseColorGallery(row.gallery).length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {parseColorGallery(row.gallery).map((url) => (
            <li key={url} className="relative">
              <span className="bg-surface-container-highest block size-12 overflow-hidden rounded-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="size-full object-cover" />
              </span>
              <button
                type="button"
                aria-label="Remove this photo"
                onClick={() =>
                  onChange({
                    gallery: parseColorGallery(row.gallery)
                      .filter((v) => v !== url)
                      .join(LINE_BREAK),
                  })
                }
                className="bg-surface-container-highest text-on-surface hover:bg-error hover:text-on-error absolute -top-1 -right-1 grid size-5 place-items-center rounded-full transition-colors duration-150 focus-visible:outline-2"
              >
                <Icon name="close" size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        className="sr-only"
        onChange={(e) => {
          if (e.target.files?.length) upload(e.target.files, "primary");
          e.target.value = "";
        }}
      />

      <input
        ref={galleryRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        multiple
        className="sr-only"
        onChange={(e) => {
          if (e.target.files?.length) upload(e.target.files, "gallery");
          e.target.value = "";
        }}
      />

      {uploadError && (
        <p role="alert" className="text-error mt-2 px-1 text-xs">
          {uploadError}
        </p>
      )}

      {presetsOpen && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <li key={preset.hex}>
              <button
                type="button"
                onClick={() => {
                  onChange({ name: preset.name, hex: preset.hex });
                  setPresetsOpen(false);
                }}
                className={cn(
                  "border-outline-variant hover:bg-on-surface/[0.06] flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs",
                  "transition-colors duration-150 focus-visible:outline-2",
                )}
              >
                <span
                  aria-hidden
                  className="border-outline-variant size-3.5 rounded-full border"
                  style={{ backgroundColor: preset.hex }}
                />
                {preset.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
