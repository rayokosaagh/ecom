import { shares } from "./geometry";
import { Icon } from "@/components/ui/Icon";

export interface Segment {
  label: string;
  value: number;
  /** A CSS colour — one of the `--color-chart-*` tokens. */
  color: string;
  /** Named alongside the colour, so state never rests on hue alone. */
  icon: string;
}

/**
 * Part-to-whole across a handful of states — the order pipeline.
 *
 * One bar rather than a pie: comparing two arcs is guesswork, comparing two
 * lengths is not, and a single bar also states the total, which a pie hides.
 *
 * Segments are separated by a 2px gap of the page's own surface rather than by
 * a border. A border adds ink that isn't data and, on a thin bar, thickens
 * every segment it touches; the gap does the same job with nothing.
 */
export function StackedBar({
  segments,
  emptyMessage,
}: {
  segments: Segment[];
  emptyMessage: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  if (total === 0) {
    return <p className="text-on-surface-variant py-6 text-center text-sm">{emptyMessage}</p>;
  }

  const percentages = shares(segments.map((segment) => segment.value));

  return (
    <div className="space-y-4">
      <div className="flex h-6 gap-0.5" role="presentation">
        {segments.map((segment, index) =>
          // An empty state is left out of the bar entirely. A zero-width
          // segment still costs a 2px gap, which draws a line where there is
          // nothing to divide.
          segment.value === 0 ? null : (
            <div
              key={segment.label}
              className="h-full first:rounded-l-sm last:rounded-r-sm"
              style={{ width: `${percentages[index]}%`, backgroundColor: segment.color }}
            />
          ),
        )}
      </div>

      {/* The legend carries the counts, so every number in the bar is readable
       * as text. Nothing is written inside the segments: at four states the
       * narrow ones have no room, and a label that fits today stops fitting the
       * moment the mix changes. */}
      <ul className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {segments.map((segment, index) => (
          <li key={segment.label} className="flex items-start gap-2">
            <span className="mt-0.5 flex shrink-0" style={{ color: segment.color }}>
              <Icon name={segment.icon} size={16} />
            </span>
            <div className="min-w-0">
              <p className="text-on-surface text-sm font-medium tabular-nums">
                {segment.value.toLocaleString("en-US")}
              </p>
              <p className="text-on-surface-variant truncate text-xs">
                {segment.label}
                <span className="ml-1 tabular-nums opacity-70">
                  {percentages[index] < 1 && segment.value > 0
                    ? "<1%"
                    : `${Math.round(percentages[index])}%`}
                </span>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
