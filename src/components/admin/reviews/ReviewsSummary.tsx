import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { RatingStars } from "@/components/reviews/RatingStars";
import { cn } from "@/lib/cn";
import type { ReviewStats } from "@/lib/reviews/service";

/**
 * The figures at the top of the moderation screen.
 *
 * Deliberately a strip rather than five tiles. The dashboard already has a
 * `StatTile`, and it is the right component for the *home* dashboard, where a
 * number with a trend behind it is the content of the page. Here the content is
 * the queue underneath: these five are a heading for it, so they are drawn at
 * heading weight in one bordered row, and the page still opens on reviews
 * rather than on a wall of statistics.
 *
 * Four of the five are also filters. A moderator who reads "12 reported" wants
 * to see those twelve, and making the number itself the way there saves the
 * hunt for the pill that matches it.
 */
export function ReviewsSummary({
  stats,
  hrefFor,
}: {
  stats: ReviewStats;
  /** Builds a link to a tab, keeping whatever else is in the URL. */
  hrefFor: (tab: string) => string;
}) {
  const metrics = [
    {
      key: "average",
      label: "Average rating",
      value: stats.publishedCount === 0 ? "—" : `${stats.average.toFixed(1)}/5`,
      icon: "star",
      href: null,
    },
    {
      key: "",
      label: "Total reviews",
      value: stats.total.toLocaleString(),
      icon: "reviews",
      href: hrefFor(""),
    },
    {
      key: "published",
      label: "Published",
      value: stats.published.toLocaleString(),
      icon: "visibility",
      href: hrefFor("published"),
    },
    {
      key: "pending",
      label: "Pending",
      value: stats.pending.toLocaleString(),
      icon: "schedule",
      href: hrefFor("pending"),
    },
    {
      key: "reported",
      label: "Reported",
      value: stats.reported.toLocaleString(),
      icon: "flag",
      href: hrefFor("reported"),
    },
  ];

  return (
    <Card variant="outlined" className="overflow-hidden">
      {/* Dividers between cells rather than gaps between cards: five separate
          cards at this size read as five things, and these are one thing seen
          five ways. `divide-*` follows the wrap, so the rules land between
          whatever ends up beside what at each width. */}
      <div className="divide-outline-variant grid grid-cols-2 divide-x divide-y sm:grid-cols-3 lg:grid-cols-5 lg:divide-y-0">
        {metrics.map((metric) => {
          const body = (
            <>
              <div className="flex items-baseline gap-1.5">
                {metric.key === "average" && stats.publishedCount > 0 && (
                  <Icon
                    name="star"
                    size={18}
                    filled
                    className="text-primary translate-y-0.5"
                  />
                )}
                <span className="text-on-surface text-xl font-medium tabular-nums">
                  {metric.value}
                </span>
              </div>
              <p className="text-on-surface-variant mt-0.5 text-xs">{metric.label}</p>
            </>
          );

          if (!metric.href) {
            return (
              <div key={metric.label} className="px-4 py-3">
                {body}
              </div>
            );
          }

          return (
            <Link
              key={metric.label}
              href={metric.href}
              className={cn(
                "hover:bg-on-surface/[0.04] px-4 py-3 transition-colors duration-200",
                "focus-visible:outline-2 focus-visible:-outline-offset-2",
              )}
            >
              {body}
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

/**
 * How the ratings are spread, and how many came from a verified buyer.
 *
 * Bars drawn with a div and a width, not a chart library: this is five values
 * with no axis, no scale to read off and nothing to hover — the shape *is* the
 * information. The project has charting components for the dashboard's real
 * charts; reaching for one here would be more machinery than the picture.
 *
 * Every figure is over published reviews only, and it says so, because that is
 * the set the storefront's stars are computed from. A breakdown that quietly
 * counted hidden reviews would disagree with every product page in the shop.
 */
export function RatingBreakdown({ stats }: { stats: ReviewStats }) {
  const { distribution, publishedCount } = stats;
  const verifiedShare =
    publishedCount === 0 ? 0 : Math.round((stats.verifiedPublished / publishedCount) * 100);

  return (
    <Card variant="outlined">
      <div className="grid gap-5 p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-6">
        {/* The headline, kept beside the bars rather than above them: the
            average and the shape it comes from are one thought. */}
        <div className="sm:border-outline-variant flex shrink-0 flex-row items-center gap-4 sm:flex-col sm:items-start sm:gap-2 sm:border-r sm:pr-6">
          <div>
            <p className="text-on-surface text-3xl leading-none font-medium tabular-nums">
              {publishedCount === 0 ? "—" : stats.average.toFixed(1)}
            </p>
            <RatingStars value={stats.average} size={15} className="mt-1.5 block" />
          </div>
          <div className="text-on-surface-variant text-xs">
            <p>
              {publishedCount.toLocaleString()} published review
              {publishedCount === 1 ? "" : "s"}
            </p>
            {publishedCount > 0 && (
              <p className="mt-0.5">{verifiedShare}% verified purchases</p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          {[5, 4, 3, 2, 1].map((score) => {
            const count = distribution[score] ?? 0;
            // Against the largest bar rather than the total, so a shop whose
            // reviews are all fives still shows a readable set of bars instead
            // of one full row and four invisible ones.
            const largest = Math.max(...Object.values(distribution), 1);
            const width = count === 0 ? 0 : Math.max(2, (count / largest) * 100);

            return (
              <div key={score} className="flex items-center gap-3">
                <span className="text-on-surface-variant flex w-10 shrink-0 items-center gap-0.5 text-xs tabular-nums">
                  {score}
                  <Icon name="star" size={12} filled className="text-on-surface-variant/70" />
                </span>

                <span
                  aria-hidden
                  className="bg-on-surface/[0.06] h-2 min-w-0 flex-1 overflow-hidden rounded-full"
                >
                  <span
                    className="bg-primary block h-full rounded-full transition-[width] duration-500 ease-standard"
                    style={{ width: `${width}%` }}
                  />
                </span>

                <span className="text-on-surface-variant w-10 shrink-0 text-right text-xs tabular-nums">
                  {count.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
