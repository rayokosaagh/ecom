"use client";

import { useEffect } from "react";

import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";

/**
 * When the queue itself fails to load.
 *
 * A route-level boundary rather than a try/catch around each query, because the
 * failures worth catching here are not per-section: the database being
 * unreachable takes the figures, the counts and the rows with it, and three
 * error cards saying the same thing is worse than one.
 *
 * `reset()` re-runs the server render rather than reloading the page, so the
 * filters in the URL and the reader's place in the dashboard survive the retry.
 */
export default function ReviewsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // The digest is what ties this screen to a line in the server log; without it
  // a report of "the reviews page broke" has nothing to look up.
  useEffect(() => {
    console.error("[admin/reviews]", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="text-on-surface text-2xl font-normal">Reviews</h2>
        <p className="text-on-surface-variant mt-1 text-sm">
          Manage customer feedback and product ratings.
        </p>
      </div>

      <Card variant="outlined">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <Icon name="cloud_off" size={40} className="text-on-surface-variant" />
          <p className="text-on-surface">Could not load the reviews</p>
          <p className="text-on-surface-variant max-w-sm text-sm">
            Nothing has been changed. This is usually the database being briefly
            unreachable — trying again is safe.
            {error.digest && (
              <span className="mt-1 block font-mono text-xs">
                Reference {error.digest}
              </span>
            )}
          </p>
          <button
            type="button"
            onClick={reset}
            className="bg-primary text-on-primary state-layer mt-1 inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
          >
            <Icon name="refresh" size={18} />
            Try again
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
