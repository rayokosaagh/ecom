"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/lib/cn";
import { DURATION, EASE_EMPHASIZED_ACCELERATE } from "@/lib/motion";
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
 * The picture for one row: the product if the notice carries one, its type
 * glyph otherwise.
 *
 * Both are the same size and the same shape, which is the point — a list where
 * some rows have a photo and some do not still has one column of text down its
 * left edge, rather than two ragged ones. When there is a photo the glyph does
 * not disappear; it shrinks to a chip in the corner, because the *kind* of
 * notice is what tells you whether a picture of a laptop means it shipped or
 * means it sold out.
 */
function Thumbnail({
  notification,
  unread,
}: {
  notification: NavNotification;
  unread: boolean;
}) {
  /**
   * The stored URL turned out not to load.
   *
   * Worth handling rather than ignoring: the address is a snapshot of what the
   * product looked like when this happened, so it long outlives any guarantee
   * that the file is still there. A broken <img> renders as an alt-text stub
   * and ruins the row's alignment; falling back to the glyph keeps the list
   * looking deliberate.
   */
  const [broken, setBroken] = useState(false);
  const icon = NOTIFICATION_ICONS[notification.type];
  const tint = unread
    ? "bg-primary-container text-on-primary-container"
    : "bg-surface-container-highest text-on-surface-variant";

  if (!notification.imageUrl || broken) {
    return (
      <span
        aria-hidden
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-xl transition-colors duration-200",
          tint,
        )}
      >
        <Icon name={icon} size={20} />
      </span>
    );
  }

  return (
    <span aria-hidden className="relative size-11 shrink-0">
      {/* Plain <img> for the same reason the product cards use one: these are
          operator-supplied addresses that may point at any host, so they are
          deliberately not routed through next/image. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={notification.imageUrl}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        className="bg-surface-container-highest size-full rounded-xl object-cover"
      />
      <span
        className={cn(
          // The ring is the panel's own colour, so the chip reads as sitting on
          // top of the photo rather than being part of it.
          "ring-surface-container-high absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full ring-2 transition-colors duration-200",
          tint,
        )}
      >
        <Icon name={icon} size={12} />
      </span>
    </span>
  );
}

/**
 * The bell dropdown.
 *
 * Split out of the Navbar because a notice is now interactive in three ways —
 * open it, dismiss it, clear the lot — and each needs its own pending state.
 *
 * Note what this does *not* do: clear the bell's badge. Opening the panel is
 * what spends that, and the Navbar handles it, because it happens whether or
 * not anything in here is touched.
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
    <div className="flex max-h-[min(30rem,70vh)] flex-col">
      {/* Header. Two rows rather than one: the title and its count sit
          together, and the two destructive-ish actions get their own line
          instead of being crushed against the right edge at 22rem wide. */}
      <div className="border-outline-variant bg-surface-container-high sticky top-0 z-10 border-b px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <p className="text-on-surface text-sm font-medium">Notifications</p>
          {unreadCount > 0 && (
            <span className="bg-primary-container text-on-primary-container rounded-full px-2 py-0.5 text-label-sm leading-4 font-medium">
              {unreadCount} unread
            </span>
          )}
        </div>

        {visible.length > 0 && (
          <div className="mt-1.5 flex items-center gap-3">
            {unreadCount > 0 && (
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(async () => markAllNotificationsRead())}
                className="text-primary inline-flex items-center gap-1 rounded-sm text-xs font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
              >
                <Icon name="done_all" size={14} />
                Mark all read
              </button>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                // Optimistic: every id goes into `dismissed` so the list empties
                // on the click rather than on the round trip.
                setDismissed(notifications.map((n) => n.id));
                startTransition(async () => clearAllNotifications());
              }}
              className="text-on-surface-variant hover:text-error inline-flex items-center gap-1 rounded-sm text-xs font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
            >
              <Icon name="delete_sweep" size={14} />
              Clear all
            </button>
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <span className="bg-surface-container-highest text-on-surface-variant grid size-12 place-items-center rounded-full">
            <Icon name="notifications_off" size={24} />
          </span>
          <p className="text-on-surface mt-1 text-sm font-medium">
            You&rsquo;re all caught up
          </p>
          <p className="text-on-surface-variant max-w-[16rem] text-xs">
            Order updates and replies to your reviews will show up here.
          </p>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
          <AnimatePresence initial={false}>
            {visible.map((n) => (
              <motion.li
                key={n.id}
                layout={!reduceMotion}
                exit={
                  reduceMotion
                    ? { opacity: 0 }
                    : {
                        opacity: 0,
                        x: 24,
                        height: 0,
                        // The JS twin of `.animate-row-exit`, and it was the one
                        // that had drifted: 180ms is not on the M3 scale, and
                        // with no curve named Framer applied its default
                        // *decelerating* ease — a row sliding out slowing down
                        // as it goes, which is the opposite of what leaving
                        // should look like. Accelerate is the exit half of the
                        // emphasized pair.
                        transition: {
                          duration: DURATION.short4,
                          ease: EASE_EMPHASIZED_ACCELERATE,
                        },
                      }
                }
                className="group relative px-1.5 py-0.5"
              >
                {/* A button, not a link, because opening also marks the notice
                    read — but it behaves like a link, and the hint below says
                    where it goes. */}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => open(n)}
                  className={cn(
                    "relative flex w-full items-start gap-3 rounded-xl py-2.5 pr-9 pl-3 text-left",
                    "transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2",
                    n.unread
                      ? "bg-primary/[0.05] hover:bg-primary/[0.09]"
                      : "hover:bg-on-surface/[0.06]",
                  )}
                >
                  {/* The unread mark, as a bar rather than the old floating
                      dot. A dot on the right competed with the dismiss button
                      for the same corner; a rail down the leading edge is
                      readable at a glance and cannot collide with anything. */}
                  {n.unread && (
                    <span
                      aria-label="Unread"
                      className="bg-primary absolute top-3 bottom-3 left-0 w-[3px] rounded-full"
                    />
                  )}

                  <Thumbnail notification={n} unread={n.unread} />

                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block text-sm leading-5",
                        n.unread
                          ? "text-on-surface font-medium"
                          : "text-on-surface-variant",
                      )}
                    >
                      {n.title}
                    </span>

                    {/* Clamped rather than truncated: two lines is enough for
                        "Someone replied to your review of X" to survive, where
                        one line cuts it at the part that says which. */}
                    <span className="text-on-surface-variant mt-0.5 line-clamp-2 block text-xs leading-4">
                      {n.description}
                    </span>

                    <span className="mt-1.5 flex items-center gap-1.5 text-xs">
                      <span className="text-on-surface-variant">{n.time}</span>
                      {/* The affordance that was missing: it now says out loud
                          that pressing this goes somewhere. */}
                      {n.href && (
                        <>
                          <span aria-hidden className="text-outline">
                            ·
                          </span>
                          <span className="text-primary inline-flex items-center gap-0.5 font-medium">
                            {DESTINATION_HINT[n.type]}
                            <Icon
                              name="arrow_forward"
                              size={13}
                              className="transition-transform duration-200 group-hover:translate-x-0.5"
                            />
                          </span>
                        </>
                      )}
                    </span>
                  </span>
                </button>

                {/* Outside the row button — nesting it would be invalid and
                    would swallow the row's own click. */}
                <button
                  type="button"
                  aria-label={`Dismiss ${n.title}`}
                  onClick={() => dismiss(n.id)}
                  className={cn(
                    "text-on-surface-variant hover:bg-on-surface/[0.1] hover:text-on-surface absolute top-3 right-3 grid size-7 place-items-center rounded-full transition-all duration-150 focus-visible:opacity-100 focus-visible:outline-2",
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
