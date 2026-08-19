"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

/** Inside this, the note counts down live rather than naming a date. */
const LIVE_WITHIN_MS = 48 * 60 * 60 * 1000;

/**
 * When a standing sale ends, for the shopper.
 *
 * Two voices. More than two days out it names the date — "Sale ends 25 Aug"
 * — which is what a person wants to know and needs no clock. Inside two days
 * it counts down — "Sale ends in 1 day 4 hrs", then "in 3 hrs 12 min" — and
 * at zero it refreshes the route, which runs the server's lazy sweep and puts
 * the regular price back; a note that hid itself client-side would leave the
 * page advertising a price the server has already restored.
 *
 * Hydration-safe the way `FlashCountdown` is: the server passes the instant
 * and the milliseconds it had calculated, the first client render uses that
 * figure verbatim, and the browser only consults its own clock in an effect.
 */
export function SaleEnds({
  endsAtMs,
  remainingMs,
  className,
  compact = false,
  tone = "tertiary",
}: {
  endsAtMs: number;
  remainingMs: number;
  className?: string;
  /** Cards: shorter words, no icon. */
  compact?: boolean;
  /** "inherit" on tinted surfaces that set their own text colour. */
  tone?: "tertiary" | "inherit";
}) {
  const [left, setLeft] = useState(remainingMs);
  const router = useRouter();
  const refreshed = useRef(false);

  const live = left <= LIVE_WITHIN_MS;

  useEffect(() => {
    if (!live) return;
    const tick = () => {
      const next = Math.max(0, endsAtMs - Date.now());
      setLeft(next);
      if (next === 0 && !refreshed.current) {
        refreshed.current = true;
        router.refresh();
      }
    };
    tick();
    // A minute is fine: the note reads in days/hours/minutes, never seconds.
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [endsAtMs, live, router]);

  let text: string;
  if (!live) {
    text = `Sale ends ${new Date(endsAtMs).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
  } else if (left === 0) {
    text = "Sale ending…";
  } else {
    const totalMinutes = Math.ceil(left / 60_000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    const parts =
      days > 0
        ? [`${days} day${days === 1 ? "" : "s"}`, `${hours} hr${hours === 1 ? "" : "s"}`]
        : hours > 0
          ? [`${hours} hr${hours === 1 ? "" : "s"}`, `${minutes} min`]
          : [`${minutes} min`];
    text = `Sale ends in ${parts.join(" ")}`;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium tabular-nums",
        tone === "tertiary" ? "text-tertiary" : "opacity-80",
        className,
      )}
      role={live ? "timer" : undefined}
      aria-live="off"
    >
      {!compact && <Icon name="schedule" size={14} />}
      {text}
    </span>
  );
}
