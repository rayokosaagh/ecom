"use client";

import { useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import type { ReviewStatusValue } from "./types";

/**
 * What a moderator can do to a review, given where it currently stands.
 *
 * The rule the list follows: only offer what would change something. A
 * published review has no Publish button, a hidden one has no Hide, and neither
 * has a "dismiss reports" until somebody has actually reported it. Buttons that
 * are present but inert are the reason moderation screens stop being trusted.
 *
 * Hiding asks twice. It takes somebody's writing off the shop and sends them a
 * notice saying so, and it sits one careless click away from Publish — the same
 * two-step the delete controls elsewhere in the dashboard use, in the same
 * place rather than as a modal, because a dialog for a reversible action is a
 * ceremony nobody reads by the fourth time.
 */

export type ModerationAction = "publish" | "hide" | "dismiss";

const BUTTON =
  "state-layer inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 disabled:opacity-60 disabled:pointer-events-none";

/** Filled: the affirmative one, and never more than one per row. */
const PRIMARY = "bg-primary text-on-primary";
/** Outlined and in the error ink: available, but not the obvious thing to do. */
const DANGER = "border-outline text-error border";
const QUIET = "border-outline text-on-surface-variant border";

export function ModerationActions({
  status,
  reportCount,
  pending,
  onAction,
  /** Opens the detail panel — where a report is actually read. */
  onReview,
  /** Stacked and full width in the drawer's footer; inline on a card. */
  layout = "inline",
  className,
}: {
  status: ReviewStatusValue;
  reportCount: number;
  pending: ModerationAction | null;
  onAction: (action: ModerationAction) => void;
  onReview?: () => void;
  layout?: "inline" | "stacked";
  className?: string;
}) {
  const [confirmingHide, setConfirmingHide] = useState(false);

  const busy = pending !== null;
  const grow = layout === "stacked" ? "flex-1 justify-center" : "";

  if (confirmingHide) {
    return (
      <div className={cn("flex flex-wrap items-center gap-2", className)}>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setConfirmingHide(false);
            onAction("hide");
          }}
          className={cn(BUTTON, "bg-error text-on-error", grow)}
        >
          {pending === "hide" ? (
            <Icon name="progress_activity" size={16} className="motion-safe:animate-spin" />
          ) : (
            <Icon name="visibility_off" size={16} />
          )}
          Hide it
        </button>
        <button
          type="button"
          onClick={() => setConfirmingHide(false)}
          className={cn(BUTTON, "text-on-surface-variant", grow)}
        >
          Keep it
        </button>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {/* A flagged review leads with the report, whatever state it is in: the
          question in front of the moderator is "is this complaint fair", and
          that cannot be answered from a list row. */}
      {reportCount > 0 && onReview && (
        <button
          type="button"
          disabled={busy}
          onClick={onReview}
          className={cn(BUTTON, QUIET, grow)}
        >
          <Icon name="flag" size={16} />
          Review report
        </button>
      )}

      {status !== "PUBLISHED" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction("publish")}
          className={cn(BUTTON, PRIMARY, grow)}
        >
          {pending === "publish" ? (
            <Icon name="progress_activity" size={16} className="motion-safe:animate-spin" />
          ) : (
            <Icon name="visibility" size={16} />
          )}
          {status === "PENDING" ? "Publish" : "Publish again"}
        </button>
      )}

      {status !== "HIDDEN" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirmingHide(true)}
          className={cn(BUTTON, DANGER, grow)}
        >
          <Icon name="visibility_off" size={16} />
          Hide
        </button>
      )}

      {/* The other answer to a flag, and the one a queue is unusable without:
          "there is nothing wrong with this". Only in the panel, where the
          reports have actually been read. */}
      {reportCount > 0 && !onReview && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction("dismiss")}
          className={cn(BUTTON, QUIET, grow)}
        >
          {pending === "dismiss" ? (
            <Icon name="progress_activity" size={16} className="motion-safe:animate-spin" />
          ) : (
            <Icon name="flag_circle" size={16} />
          )}
          Dismiss {reportCount === 1 ? "report" : "reports"}
        </button>
      )}
    </div>
  );
}
