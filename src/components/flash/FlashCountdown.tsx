"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/cn";

/**
 * Time left in a flash sale.
 *
 * The awkward part of a countdown in a server-rendered app is that it is
 * *derived from the clock*, and the server's clock is not the visitor's. Reading
 * `Date.now()` during the first client render would produce a different number
 * than the one in the HTML and React would report a hydration mismatch — so the
 * server passes both the instant the sale ends and the milliseconds it had
 * calculated at render time, and that figure is the initial state verbatim.
 * The two renders therefore agree by construction, and the browser only starts
 * doing its own arithmetic in an effect, after hydration is safely done.
 *
 * From that point it recomputes from `endsAtMs` rather than subtracting a second
 * each tick. Intervals drift, and a backgrounded tab has its timers throttled
 * hard — a decrementing counter comes back from a minimised window minutes
 * behind, still confidently counting.
 */
export function FlashCountdown({
  endsAtMs,
  remainingMs,
  className,
}: {
  /** When the sale closes, in epoch milliseconds. */
  endsAtMs: number;
  /** Milliseconds left as the server saw it. The initial render uses this. */
  remainingMs: number;
  className?: string;
}) {
  const [left, setLeft] = useState(remainingMs);
  const router = useRouter();
  // Guards the refresh: the interval keeps firing while the route re-renders,
  // and without this every tick past zero would queue another one.
  const refreshed = useRef(false);

  useEffect(() => {
    const tick = () => {
      const next = Math.max(0, endsAtMs - Date.now());
      setLeft(next);

      if (next === 0 && !refreshed.current) {
        refreshed.current = true;
        // The window has closed. A refresh re-runs the server component, which
        // reconciles the sale — restoring every price — and drops this section.
        // Hiding it client-side instead would leave the page advertising prices
        // the server has already put back.
        router.refresh();
      }
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [endsAtMs, router]);

  const totalSeconds = Math.floor(left / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  // Days only once there is more than one, so the common case — a sale ending
  // today — is three fields rather than a leading "00".
  const parts = [
    ...(days > 0 ? [{ value: days, label: days === 1 ? "day" : "days" }] : []),
    { value: hours, label: "hrs" },
    { value: minutes, label: "min" },
    { value: seconds, label: "sec" },
  ];

  return (
    <div
      className={cn("flex items-center gap-1.5", className)}
      // The whole group is one live region, announced as a single sentence
      // rather than four separate numbers changing.
      role="timer"
      aria-live="off"
      aria-label={`Ends in ${days > 0 ? `${days} days ` : ""}${hours} hours ${minutes} minutes ${seconds} seconds`}
    >
      {parts.map((part, index) => (
        <div key={part.label} className="flex items-center gap-1.5">
          {index > 0 && (
            <span aria-hidden className="text-on-surface-variant/50 text-lg leading-none">
              :
            </span>
          )}
          <span
            aria-hidden
            className="bg-surface-container flex min-w-12 flex-col items-center rounded-lg px-2 py-1.5"
          >
            {/* Lining figures at a fixed width, or the box jostles every second
                as the glyphs change width. */}
            <span className="text-on-surface text-lg leading-none font-medium tabular-nums">
              {String(part.value).padStart(2, "0")}
            </span>
            <span className="label-caps text-on-surface-variant mt-1">
              {part.label}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
