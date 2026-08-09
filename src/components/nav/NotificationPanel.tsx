"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import {
  clearAllNotifications,
  dismissNotification,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/actions/notifications";
import type { NavNotification } from "./Navbar";

const NOTIFICATION_ICONS: Record<NavNotification["type"], string> = {
  ORDER: "shopping_bag",
  STOCK: "inventory_2",
  ACCOUNT: "person_add",
  SYSTEM: "info",
};

/** What a notice of each kind is offering to show you. */
const DESTINATION_HINT: Record<NavNotification["type"], string> = {
  ORDER: "View order",
  STOCK: "View product",
  ACCOUNT: "View account",
  SYSTEM: "Open",
};

/**
 * The bell dropdown.
 *
 * Split out of the Navbar because a notice is now interactive in three ways —
 * open it, dismiss it, clear the lot — and each needs its own pending state.
 */
export function NotificationPanel({
  notifications,
  onNavigate,
  reduceMotion,
}: {
  notifications: NavNotification[];
  /** Closes the dropdown. Called before navigating, so the panel does not
      linger over the page it just took you to. */
  onNavigate: () => void;
  reduceMotion: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  /** Rows on their way out, so a dismissal reads as immediate. */
  const [dismissed, setDismissed] = useState<string[]>([]);

  const visible = notifications.filter((n) => !dismissed.includes(n.id));
  const unreadCount = visible.filter((n) => n.unread).length;

  /**
   * Open a notice.
   *
   * The read and the navigation are deliberately not awaited together: the
   * route change starts immediately and marking read settles behind it. The
   * old code only marked read, which is why pressing a notification appeared
   * to do nothing at all.
   */
  const open = (notification: NavNotification) => {
    onNavigate();
    if (notification.href) router.push(notification.href);
    if (notification.unread) {
      startTransition(async () => {
        await markNotificationRead(notification.id);
      });
    }
  };

  const dismiss = (id: string) => {
    setDismissed((current) => [...current, id]);
    startTransition(async () => {
      await dismissNotification(id);
    });
  };

  return (
    <div className="flex max-h-[min(28rem,70vh)] flex-col">
      <div className="border-outline-variant flex items-center justify-between gap-2 border-b px-4 py-3">
        <p className="text-on-surface text-sm font-medium">
          Notifications
          {unreadCount > 0 && (
            <span className="text-on-surface-variant ml-1.5 font-normal">
              · {unreadCount} new
            </span>
          )}
        </p>

        <div className="flex shrink-0 items-center gap-3">
          {unreadCount > 0 && (
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(async () => markAllNotificationsRead())}
              className="text-primary rounded-sm text-xs font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
            >
              Mark all read
            </button>
          )}
          {visible.length > 0 && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                // Optimistic: every id goes into `dismissed` so the list empties
                // on the click rather than on the round trip.
                setDismissed(notifications.map((n) => n.id));
                startTransition(async () => clearAllNotifications());
              }}
              className="text-on-surface-variant hover:text-error rounded-sm text-xs font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <Icon name="notifications_off" size={28} className="text-on-surface-variant" />
          <p className="text-on-surface-variant text-sm">You&rsquo;re all caught up.</p>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <AnimatePresence initial={false}>
            {visible.map((n) => (
              <motion.li
                key={n.id}
                layout={!reduceMotion}
                exit={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, x: 24, height: 0, transition: { duration: 0.18 } }
                }
                className="group border-outline-variant/40 relative border-b last:border-b-0"
              >
                {/* A button, not a link, because opening also marks the notice
                    read — but it behaves like a link, and the hint below says
                    where it goes. */}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => open(n)}
                  className="hover:bg-on-surface/[0.06] flex w-full items-start gap-3 py-3 pr-10 pl-4 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full transition-colors duration-200",
                      n.unread
                        ? "bg-primary-container text-on-primary-container"
                        : "bg-surface-container-highest text-on-surface-variant",
                    )}
                  >
                    <Icon name={NOTIFICATION_ICONS[n.type]} size={18} />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-sm",
                          n.unread
                            ? "text-on-surface font-medium"
                            : "text-on-surface-variant",
                        )}
                      >
                        {n.title}
                      </span>
                      <span className="text-on-surface-variant shrink-0 text-xs">
                        {n.time}
                      </span>
                    </span>

                    <span className="text-on-surface-variant mt-0.5 block text-xs">
                      {n.description}
                    </span>

                    {/* The affordance that was missing: it now says out loud
                        that pressing this goes somewhere. */}
                    {n.href && (
                      <span className="text-primary mt-1.5 inline-flex items-center gap-1 text-xs font-medium">
                        {DESTINATION_HINT[n.type]}
                        <Icon
                          name="arrow_forward"
                          size={14}
                          className="transition-transform duration-200 group-hover:translate-x-0.5"
                        />
                      </span>
                    )}
                  </span>

                  {n.unread && (
                    <span
                      aria-label="Unread"
                      className="bg-primary mt-2 size-2 shrink-0 rounded-full"
                    />
                  )}
                </button>

                {/* Outside the row button — nesting it would be invalid and
                    would swallow the row's own click. */}
                <button
                  type="button"
                  aria-label={`Dismiss ${n.title}`}
                  onClick={() => dismiss(n.id)}
                  className={cn(
                    "text-on-surface-variant hover:bg-on-surface/[0.08] hover:text-on-surface absolute top-2 right-2 grid size-7 place-items-center rounded-full transition-all duration-150 focus-visible:opacity-100 focus-visible:outline-2",
                    // Hover-reveal keeps the row calm on a desktop, but a touch
                    // screen never hovers — there the button is simply there.
                    "opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100",
                  )}
                >
                  <Icon name="close" size={16} />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
