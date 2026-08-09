import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Sparkline } from "@/components/charts/Sparkline";
import { formatDelta, type Delta } from "@/lib/dashboard/range";
import { cn } from "@/lib/cn";

/**
 * One headline number.
 *
 * A single value with a direction is not a chart — a one-bar bar chart says
 * nothing the number does not. So the tile is the form: the figure, what it
 * changed by, and the shape it took getting there.
 *
 * The delta's colour is direction × whether up is good, which is why
 * `upIsGood` exists: rising revenue is green and rising cancellations is not,
 * and a component that assumed up-is-green would quietly congratulate the shop
 * on the second one. The arrow and the sign carry the same meaning as the
 * colour, so nothing here depends on seeing it.
 */
export function StatTile({
  label,
  value,
  delta,
  trend,
  icon,
  upIsGood = true,
  /** Shown in place of a delta when there is no earlier period to compare. */
  noteWhenNoDelta = "No prior period",
}: {
  label: string;
  value: string;
  delta: Delta | null;
  trend?: number[];
  icon: string;
  upIsGood?: boolean;
  noteWhenNoDelta?: string;
}) {
  const good = delta && delta.direction !== "flat" && (delta.direction === "up") === upIsGood;
  const bad = delta && delta.direction !== "flat" && !good;

  return (
    <Card variant="outlined">
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-on-surface-variant text-sm">{label}</p>
          <span className="text-on-surface-variant flex shrink-0">
            <Icon name={icon} size={18} />
          </span>
        </div>

        {/* Proportional figures, not tabular: at this size equal-width digits
         * make a number like 121 look gap-toothed. Tabular is for columns. */}
        <p className="text-on-surface text-3xl leading-none font-medium">{value}</p>

        <div className="flex items-center justify-between gap-3">
          {delta ? (
            <span
              className={cn(
                "flex items-center gap-0.5 text-xs font-medium tabular-nums",
                good && "text-chart-up",
                bad && "text-chart-down",
                !good && !bad && "text-on-surface-variant",
              )}
            >
              <Icon
                name={
                  delta.direction === "up"
                    ? "trending_up"
                    : delta.direction === "down"
                      ? "trending_down"
                      : "trending_flat"
                }
                size={16}
              />
              {formatDelta(delta)}
            </span>
          ) : (
            <span className="text-on-surface-variant text-xs">{noteWhenNoDelta}</span>
          )}

          {trend && trend.length > 1 && (
            <div className="w-20 shrink-0">
              <Sparkline values={trend} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
