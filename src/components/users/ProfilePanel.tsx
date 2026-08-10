import type { ReactNode } from "react";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

/**
 * One section of the profile.
 *
 * Every section is the same object: a card with its title inside it. Before
 * this, three sections put their heading on the page background and two put it
 * inside their card, which read as two different kinds of thing on one page and
 * cost an extra gap per section. Self-contained panels also survive being moved
 * between the two columns — which is the whole point of the layout — because a
 * panel carries its own header rather than depending on one the page drew above
 * it.
 *
 * A Server Component with no state. The heading level is fixed at `h2`: the
 * page is a flat list of sections under one `h1`, and a heading that changed
 * level with its column would break the outline a screen reader navigates by.
 */
export function ProfilePanel({
  id,
  title,
  blurb,
  action,
  children,
  className,
  /** Removes the body padding, for a panel whose children are full-bleed rows. */
  flush = false,
}: {
  id?: string;
  title: string;
  blurb?: string;
  action?: { href: string; label: string; icon?: string };
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <Card
      variant="outlined"
      id={id}
      className={cn("scroll-mt-24 overflow-hidden", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-6 pt-5 pb-4">
        <div className="min-w-0">
          <h2 className="text-on-surface text-base font-medium">{title}</h2>
          {blurb && (
            <p className="text-on-surface-variant mt-0.5 text-xs">{blurb}</p>
          )}
        </div>

        {action && (
          <Link
            href={action.href}
            className="text-primary state-layer -my-1 -mr-2 inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {action.label}
            {action.icon && <Icon name={action.icon} size={16} />}
          </Link>
        )}
      </div>

      {flush ? children : <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  );
}

/**
 * The empty state a panel shows instead of its contents.
 *
 * Shared so "nothing here yet" looks the same in all five places rather than
 * being re-invented per section with a slightly different icon size each time.
 */
export function PanelEmpty({
  icon,
  message,
  action,
}: {
  icon: string;
  message: string;
  action?: { href: string; label: string; primary?: boolean };
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <Icon name={icon} size={32} className="text-on-surface-variant" />
      <p className="text-on-surface-variant text-sm">{message}</p>
      {action && (
        <Link
          href={action.href}
          className={cn(
            "state-layer mt-1 inline-flex h-10 items-center rounded-full px-6 text-sm font-medium",
            "focus-visible:outline-2 focus-visible:outline-offset-2",
            action.primary
              ? "bg-primary text-on-primary"
              : "border-outline text-primary border",
          )}
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
