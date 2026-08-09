"use client";

import { useCallback, useSyncExternalStore } from "react";

import { MAX_COMPARE } from "@/lib/products/compare";

export interface CompareEntry {
  slug: string;
  name: string;
  image: string | null;
  /** Top-level category id. Everything in a comparison shares one. */
  groupId: string;
  groupName: string;
}

/**
 * Comparison selection, held in the browser.
 *
 * `localStorage` rather than a cookie or the query string: toggling a checkbox
 * while browsing should be instant, and threading a growing id list through
 * every facet href on the catalogue would make each filter link depend on the
 * selection. The comparison *page* still takes its ids from the URL, so a
 * comparison stays shareable — this only decides what to link to.
 *
 * Read through `useSyncExternalStore` rather than an effect that seeds state.
 * localStorage is precisely the "external store" that hook exists for: the
 * server snapshot is empty so hydration matches the markup, and the real value
 * arrives immediately afterwards without a cascading render.
 *
 * The category lock lives here as well as on the server. This copy makes it
 * *legible* — greying out a card that cannot join — while /compare enforces it
 * for real, because a hand-typed URL never passes through here.
 */

const STORAGE_KEY = "ecom.compare.v1";

/** Stable reference, or `useSyncExternalStore` would loop forever. */
const EMPTY: CompareEntry[] = [];

let cache: CompareEntry[] | null = null;
const listeners = new Set<() => void>();

function isEntry(value: unknown): value is CompareEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.slug === "string" && typeof entry.groupId === "string";
}

function read(): CompareEntry[] {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    cache = Array.isArray(parsed) ? parsed.filter(isEntry) : EMPTY;
  } catch {
    // Unreadable or disabled storage is not worth failing a render for.
    cache = EMPTY;
  }
  return cache;
}

function write(next: CompareEntry[]) {
  cache = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode and quota errors are survivable; the selection simply does
    // not outlive the tab.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  // Another tab changing the selection invalidates ours.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    cache = null;
    for (const l of listeners) l();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The server has no selection, so hydration starts from the same empty list. */
const serverSnapshot = () => EMPTY;

export function useCompare() {
  const items = useSyncExternalStore(subscribe, read, serverSnapshot);

  const groupId = items[0]?.groupId ?? null;
  const groupName = items[0]?.groupName ?? null;

  const has = useCallback(
    (slug: string) => items.some((item) => item.slug === slug),
    [items],
  );

  /** Whether this product could join the comparison as it stands. */
  const canAdd = useCallback(
    (entry: CompareEntry) =>
      items.some((item) => item.slug === entry.slug) ||
      items.length === 0 ||
      (entry.groupId === groupId && items.length < MAX_COMPARE),
    [items, groupId],
  );

  const toggle = useCallback(
    (entry: CompareEntry) => {
      if (items.some((item) => item.slug === entry.slug)) {
        write(items.filter((item) => item.slug !== entry.slug));
        return;
      }
      // A different category cannot simply be appended — callers are expected
      // to offer `restart` instead.
      if (items.length > 0 && items[0].groupId !== entry.groupId) return;
      if (items.length >= MAX_COMPARE) return;
      write([...items, entry]);
    },
    [items],
  );

  const remove = useCallback(
    (slug: string) => write(items.filter((item) => item.slug !== slug)),
    [items],
  );

  const clear = useCallback(() => write(EMPTY), []);

  /** Swap to a different category, keeping only the product just picked. */
  const restart = useCallback((entry: CompareEntry) => write([entry]), []);

  return {
    items,
    groupId,
    groupName,
    has,
    canAdd,
    toggle,
    remove,
    clear,
    restart,
    full: items.length >= MAX_COMPARE,
  };
}
