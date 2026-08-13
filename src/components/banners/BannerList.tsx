"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Reorder, useDragControls, useReducedMotion } from "framer-motion";

import { Icon } from "@/components/ui/Icon";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import {
  deleteBanner,
  reorderBanners,
  toggleBannerActive,
} from "@/lib/actions/banners";

export interface BannerRow {
  id: string;
  imageUrl: string;
  heading: string;
  ctaLabel: string;
  ctaLink: string;
  isActive: boolean;
  /** Category section it appears under, or null. */
  group: string | null;
  /** Preformatted on the server — see lib/banners/format. */
  schedule: string | null;
  /** Why it is off the storefront right now, or null when it is live. */
  hiddenReason: string | null;
}

/** M3-style switch. A real `role="switch"` button, so it is keyboard operable. */
function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "relative h-8 w-13 shrink-0 rounded-full border-2 transition-colors duration-200",
        "focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50",
        checked
          ? "bg-primary border-primary"
          : "bg-surface-container-highest border-outline",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 block -translate-y-1/2 rounded-full transition-all duration-200 ease-emphasized",
          checked
            ? "bg-on-primary left-[calc(100%-1.5rem)] size-6"
            : "bg-outline left-1 size-4",
        )}
      />
    </button>
  );
}

/**
 * Reorderable list of promo banners.
 *
 * Order is committed when a drag ends rather than on every pointer move, so a
 * single drag costs one write. The list is also reorderable from the keyboard
 * through the move buttons — drag-and-drop alone would leave the feature
 * unusable without a pointer.
 */
export function BannerList({ banners }: { banners: BannerRow[] }) {
  const reduceMotion = useReducedMotion() ?? false;
  const [items, setItems] = useState(banners);
  const [pending, startTransition] = useTransition();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // The server is the source of truth after any mutation revalidates. Adopting
  // new props during render (rather than in an effect) is React's documented
  // way to reset state when an input changes.
  const [lastBanners, setLastBanners] = useState(banners);
  if (lastBanners !== banners) {
    setLastBanners(banners);
    setItems(banners);
  }

  const persistOrder = (next: BannerRow[]) => {
    startTransition(async () => {
      await reorderBanners(next.map((banner) => banner.id));
    });
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;

    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    persistOrder(next);
  };

  const toggle = (id: string) => {
    // Optimistic: the switch should not lag a round trip behind the pointer.
    setItems((current) =>
      current.map((banner) =>
        banner.id === id ? { ...banner, isActive: !banner.isActive } : banner,
      ),
    );
    startTransition(async () => {
      await toggleBannerActive(id);
    });
  };

  const remove = (id: string) => {
    setConfirmingId(null);
    setItems((current) => current.filter((banner) => banner.id !== id));
    startTransition(async () => {
      await deleteBanner(id);
    });
  };

  return (
    <div className="space-y-3">
      <p
        className="text-on-surface-variant flex h-5 items-center gap-2 text-xs"
        aria-live="polite"
      >
        {pending ? (
          <>
            <span className="border-primary size-3 animate-spin rounded-full border-2 border-t-transparent" />
            Saving…
          </>
        ) : (
          "Drag a row by its handle, or use the arrows, to change the order."
        )}
      </p>

      <Reorder.Group
        axis="y"
        values={items}
        onReorder={setItems}
        className="space-y-3"
      >
        {items.map((banner, index) => (
          <BannerRowItem
            key={banner.id}
            banner={banner}
            index={index}
            total={items.length}
            reduceMotion={reduceMotion}
            confirming={confirmingId === banner.id}
            onDragEnd={() => persistOrder(items)}
            onMove={move}
            onToggle={() => toggle(banner.id)}
            onAskDelete={() => setConfirmingId(banner.id)}
            onCancelDelete={() => setConfirmingId(null)}
            onConfirmDelete={() => remove(banner.id)}
          />
        ))}
      </Reorder.Group>
    </div>
  );
}

function BannerRowItem({
  banner,
  index,
  total,
  reduceMotion,
  confirming,
  onDragEnd,
  onMove,
  onToggle,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  banner: BannerRow;
  index: number;
  total: number;
  reduceMotion: boolean;
  confirming: boolean;
  onDragEnd: () => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onToggle: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  // Drag starts from the handle only, so the row's buttons and links stay
  // clickable and text stays selectable.
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={banner}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      transition={reduceMotion ? { duration: 0 } : undefined}
      className="list-none"
    >
      <Card variant="outlined" className="overflow-hidden">
        <div className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
          <button
            type="button"
            aria-label={`Reorder ${banner.heading}`}
            onPointerDown={(event) => controls.start(event)}
            className="text-on-surface-variant hover:bg-on-surface/[0.08] hidden size-9 shrink-0 cursor-grab touch-none place-items-center rounded-full transition-colors duration-200 focus-visible:outline-2 active:cursor-grabbing sm:grid"
          >
            <Icon name="drag_indicator" size={20} />
          </button>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={banner.imageUrl}
            alt=""
            className="bg-surface-container-highest size-14 shrink-0 rounded-lg object-cover"
          />

          <div className="min-w-0 flex-1">
            <p className="text-on-surface truncate text-sm font-medium">
              {banner.heading}
            </p>
            <p className="text-on-surface-variant truncate text-xs">
              {banner.ctaLabel} → {banner.ctaLink}
            </p>
            {(banner.schedule || banner.hiddenReason || banner.group) && (
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                {banner.hiddenReason && (
                  <span className="bg-surface-container-highest text-on-surface-variant rounded-full px-2 py-0.5">
                    {banner.hiddenReason}
                  </span>
                )}
                {banner.group && (
                  <span className="bg-secondary-container text-on-secondary-container rounded-full px-2 py-0.5">
                    {banner.group}
                  </span>
                )}
                {banner.schedule && (
                  <span className="text-on-surface-variant">{banner.schedule}</span>
                )}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {/* Keyboard-accessible equivalent of dragging. */}
            <div className="hidden flex-col sm:flex">
              <button
                type="button"
                aria-label={`Move ${banner.heading} up`}
                disabled={index === 0}
                onClick={() => onMove(index, -1)}
                className="text-on-surface-variant hover:bg-on-surface/[0.08] grid size-6 place-items-center rounded transition-colors duration-150 focus-visible:outline-2 disabled:opacity-30"
              >
                <Icon name="keyboard_arrow_up" size={18} />
              </button>
              <button
                type="button"
                aria-label={`Move ${banner.heading} down`}
                disabled={index === total - 1}
                onClick={() => onMove(index, 1)}
                className="text-on-surface-variant hover:bg-on-surface/[0.08] grid size-6 place-items-center rounded transition-colors duration-150 focus-visible:outline-2 disabled:opacity-30"
              >
                <Icon name="keyboard_arrow_down" size={18} />
              </button>
            </div>

            <Switch
              checked={banner.isActive}
              onChange={onToggle}
              label={`${banner.isActive ? "Deactivate" : "Activate"} ${banner.heading}`}
            />

            <Link
              href={`/admin/banners/${banner.id}/edit`}
              aria-label={`Edit ${banner.heading}`}
              className="text-on-surface-variant hover:bg-on-surface/[0.08] grid size-9 place-items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <Icon name="edit" size={18} />
            </Link>

            {confirming ? (
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onConfirmDelete}
                  className="bg-error text-on-error rounded-full px-3 py-1.5 text-xs font-medium transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={onCancelDelete}
                  className="text-on-surface-variant hover:bg-on-surface/[0.08] rounded-full px-3 py-1.5 text-xs transition-colors duration-150 focus-visible:outline-2"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                aria-label={`Delete ${banner.heading}`}
                onClick={onAskDelete}
                className="text-error hover:bg-error/[0.08] grid size-9 place-items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <Icon name="delete" size={18} />
              </button>
            )}
          </div>
        </div>
      </Card>
    </Reorder.Item>
  );
}
