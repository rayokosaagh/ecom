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

const NOTIFICATION_LABELS: Record<NavNotification["type"], string> = {
  ORDER: "Order update",
  STOCK: "Stock update",
  ACCOUNT: "Account",
  SYSTEM: "Update",
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
    <div className="flex max-h-[min(36rem,70dvh)] flex-col">
      {/* Header. Two rows rather than one: the title and its count sit
          together, and the two destructive-ish actions get their own line
          instead of being crushed against the right edge at 22rem wide. */}
      <div className="border-outline-variant/60 bg-surface-container-low shrink-0 border-b px-5 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <span className="bg-primary-container text-on-primary-container grid size-10 shrink-0 place-items-center rounded-2xl">
            <Icon name="notifications" size={21} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-on-surface text-base font-semibold tracking-tight">Notifications</p>
            <p className="text-on-surface-variant mt-0.5 text-xs">Your latest updates, in one place.</p>
          </div>
          {unreadCount > 0 && (
            <span className="bg-primary text-on-primary shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums">
              {unreadCount}<span className="sr-only"> unread</span>
            </span>
          )}
        </div>

        {visible.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(async () => markAllNotificationsRead())}
                className="text-primary hover:bg-primary/10 inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
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
              className="text-on-surface-variant hover:bg-error/10 hover:text-error ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
            >
              <Icon name="delete_sweep" size={14} />
              Clear all
            </button>
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="min-h-0 overflow-y-auto px-6 py-12 text-center">
          <span className="bg-primary-container text-on-primary-container mx-auto grid size-16 place-items-center rounded-3xl">
            <Icon name="done_all" size={30} />
          </span>
          <p className="text-on-surface mt-5 text-base font-semibold">
            You&rsquo;re all caught up
          </p>
          <p className="text-on-surface-variant mx-auto mt-2 max-w-[16rem] text-sm leading-relaxed">
            Order updates and replies to your reviews will show up here.
          </p>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-2">
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
                className="group relative py-1"
              >
                {/* A button, not a link, because opening also marks the notice
                    read — but it behaves like a link, and the hint below says
                    where it goes. */}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => open(n)}
                  className={cn(
                    "relative flex w-full min-w-0 items-start gap-3 rounded-2xl border py-4 pr-11 pl-3 text-left",
                    "transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2",
                    n.unread
                      ? "border-primary/10 bg-primary/[0.05] hover:bg-primary/[0.09]"
                      : "border-transparent hover:bg-surface-container-low",
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
                    <span className="text-on-surface-variant mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                      <span className={cn("font-medium", n.unread && "text-primary")}>{NOTIFICATION_LABELS[n.type]}</span>
                      <span aria-hidden>·</span>
                      <span>{n.time}</span>
                    </span>
                    <span
                      className={cn(
                        "block text-sm leading-5 [overflow-wrap:anywhere]",
                        n.unread
                          ? "text-on-surface font-semibold"
                          : "text-on-surface font-medium",
                      )}
                    >
                      {n.title}
                    </span>

                    {/* Clamped rather than truncated: two lines is enough for
                        "Someone replied to your review of X" to survive, where
                        one line cuts it at the part that says which. */}
                    <span className="text-on-surface-variant mt-1 line-clamp-2 block text-xs leading-5 [overflow-wrap:anywhere]">
                      {n.description}
                    </span>

                    {n.href && <span className="mt-2 flex items-center gap-1.5 text-xs">
                      {/* The affordance that was missing: it now says out loud
                          that pressing this goes somewhere. */}
                      {n.href && (
                        <>
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
                    </span>}
                  </span>
                </button>

                {/* Outside the row button — nesting it would be invalid and
                    would swallow the row's own click. */}
                <button
                  type="button"
                  aria-label={`Dismiss ${n.title}`}
                  onClick={() => dismiss(n.id)}
                  className={cn(
                    "text-on-surface-variant hover:bg-on-surface/[0.1] hover:text-on-surface absolute top-3 right-1.5 grid size-9 place-items-center rounded-full transition-all duration-150 focus-visible:opacity-100 focus-visible:outline-2",
                    // Hover-reveal keeps the row calm on a desktop, but a touch
                    // screen never hovers — there the button is simply there.
                    "opacity-60 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100",
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
