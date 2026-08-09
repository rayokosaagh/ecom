"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * How long a row takes to leave. Must match `--duration-short4`, which is what
 * `.row-leaving` animates on — the timer here is what decides when the row is
 * actually dropped from state, and if it fired early the animation would be cut
 * off mid-collapse.
 */
export const ROW_EXIT_MS = 200;

/**
 * Plays a row's exit before the row is removed.
 *
 * These lists delete optimistically: the row is filtered out of local state the
 * moment the button is pressed and the server is told afterwards. That is the
 * right behaviour — it just left nothing to animate, because the element was
 * gone from the tree in the same tick it was asked to leave.
 *
 * So the removal is deferred rather than the animation added: mark the row as
 * leaving, let `.row-leaving` collapse it, and only then run the caller's own
 * removal. The server action is inside that callback, so it is delayed by the
 * exit too — which is fine, and rather better than firing a request the visitor
 * can still watch the consequences of arriving.
 */
export function useRowExit() {
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(() => new Set());
  const timers = useRef(new Map<string, number>());

  // A list can be navigated away from mid-exit; nothing should fire into an
  // unmounted component afterwards.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const id of pending.values()) window.clearTimeout(id);
      pending.clear();
    };
  }, []);

  const remove = useCallback((id: string, commit: () => void) => {
    // Already on its way out — a second press must not queue a second commit.
    if (timers.current.has(id)) return;

    // Asked for less motion: drop it straight away rather than playing a
    // shortened version of the same thing.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      commit();
      return;
    }

    setLeaving((current) => new Set(current).add(id));

    timers.current.set(
      id,
      window.setTimeout(() => {
        timers.current.delete(id);
        setLeaving((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
        commit();
      }, ROW_EXIT_MS),
    );
  }, []);

  const isLeaving = useCallback((id: string) => leaving.has(id), [leaving]);

  return { isLeaving, remove };
}
