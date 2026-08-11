import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

/**
 * The card an admin list shows instead of rows.
 *
 * The pattern was already settled — icon, one line saying what happened, a
 * smaller line saying what to do, inside an outlined card — it had just been
 * written out by hand on every list page. This is that shape, extracted.
 *
 * The distinction it exists to preserve: *why* the list is empty. "No orders
 * yet" and "nothing matches that search" want different glyphs, different
 * words, and different ways out, and a component that renders one message for
 * both tells a new shop its checkout is broken.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: string;
  title: string;
  description?: string;
  /** Usually a link back out of the filter, or the "Add …" the list is missing. */
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card variant="outlined" className={className}>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <Icon name={icon} size={40} className="text-on-surface-variant" />
        <p className="text-on-surface">{title}</p>
        {description && (
          <p className="text-on-surface-variant max-w-sm text-sm">{description}</p>
        )}
        {action && <div className={cn("mt-1")}>{action}</div>}
      </CardContent>
    </Card>
  );
}
