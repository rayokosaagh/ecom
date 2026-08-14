import Link from "next/link";

import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Role } from "@/generated/prisma/enums";

/**
 * The top of the account page: who you are, and how much of everything you have.
 *
 * Two things stacked inside one card rather than two cards, because they answer
 * the same question — "what state is my account in" — and a border between them
 * would suggest they could be read separately. The greeting names the person;
 * the strip under it counts what they came to check, and each count is itself
 * the way through to the thing it counts. That is the point of the strip: it
 * replaces the scroll-and-hunt that a flat list of panels forces on anyone who
 * arrived wanting one number.
 *
 * A Server Component. Every control is a link, including the avatar's camera
 * badge — the upload itself lives on /profile/edit, which is a Client Component
 * on its own route, so the account page still costs no form JavaScript.
 */
export function ProfileHero({
  user,
  stats,
}: {
  user: { name: string | null; email: string; image: string | null; role: Role; createdAt: Date };
  stats: { orders: number; pending: number; wishlist: number; reviews: number };
}) {
  const initial = (user.name ?? user.email).charAt(0).toUpperCase();
  const since = user.createdAt.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  // First name only. "Welcome back, Prishem Limbu!" reads as a form letter;
  // the greeting is the one place on the page that should sound like a person.
  const firstName = user.name?.trim().split(/\s+/)[0];

  return (
    <Card variant="outlined">
      <CardContent className="space-y-5 py-5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
          <div className="relative shrink-0">
            <div className="bg-primary-container text-on-primary-container grid size-16 place-items-center overflow-hidden rounded-full text-xl font-medium sm:size-20 sm:text-2xl">
              {user.image ? (
                /* Plain <img> for the same reason `AvatarField` uses one: the
                   address may be any host, and next/image would need each in
                   remotePatterns. */
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={user.image} alt="" className="size-full object-cover" />
              ) : (
                <span aria-hidden>{initial}</span>
              )}
            </div>

            {/* The badge is a link rather than an input: a file picker here
                would need the whole edit form's JavaScript on a page that is
                otherwise entirely static. */}
            <Link
              href="/profile/edit"
              aria-label="Change your photo"
              className="border-outline-variant bg-surface text-on-surface-variant hover:text-primary absolute -right-1 -bottom-1 grid size-8 place-items-center rounded-full border shadow-elevation-1 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <Icon name="photo_camera" size={16} />
            </Link>
          </div>

          <div className="min-w-0 flex-1 basis-56">
            <h1 className="text-on-surface text-title-lg sm:text-headline-sm truncate">
              {firstName ? `Welcome back, ${firstName}!` : "Your account"}
            </h1>
            <p className="text-on-surface-variant truncate text-sm">{user.email}</p>

            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <Chip
                icon={user.role === Role.ADMIN ? "shield_person" : "person"}
                label={user.role === Role.ADMIN ? "Administrator" : "Standard user"}
              />
              <Chip icon="calendar_month" label={`Member since ${since}`} />
            </div>
          </div>

          <Link
            href="/profile/edit"
            className="border-outline text-primary state-layer inline-flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-full border px-5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto"
          >
            <Icon name="edit" size={18} />
            Edit profile
          </Link>
        </div>

        {/*
          Hairlines rather than `divide-x`: the tiles wrap to two columns below
          `lg` and to one on a phone, and a left border applied by DOM order
          would draw itself down the outside edge at every wrap point. A 1px gap
          over a coloured background wraps correctly because the gap *is* the
          background showing through.
        */}
        <div className="bg-outline-variant border-outline-variant grid gap-px overflow-hidden rounded-xl border sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            icon="receipt_long"
            tint="bg-primary-container text-on-primary-container"
            label="Orders"
            value={stats.orders}
            href="/orders"
            action="View all orders"
          />
          <Stat
            icon="pending"
            tint="bg-tertiary-container text-on-tertiary-container"
            label="Pending"
            value={stats.pending}
            href="/profile?status=PENDING#orders"
            action="Track your orders"
          />
          <Stat
            icon="favorite"
            tint="bg-error-container text-on-error-container"
            label="Wishlist"
            value={stats.wishlist}
            href="/wishlist"
            action="Saved items"
          />
          <Stat
            icon="star"
            tint="bg-warning-container text-on-warning-container"
            label="Reviews"
            value={stats.reviews}
            href="/profile#purchases"
            action="Your reviews"
          />
        </div>
      </CardContent>
    </Card>
  );
}

/** One piece of account metadata, as a pill. */
function Chip({ icon, label }: { icon: string; label: string }) {
  return (
    <span className="bg-surface-container-high text-on-surface-variant inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs">
      <Icon name={icon} size={15} />
      {label}
    </span>
  );
}

/**
 * One count, and the way to the thing it counts.
 *
 * The number is the tallest thing in the tile and the link sits under it, so a
 * glance answers "how many" and only a second look is spent on "where". The
 * whole tile is not itself a link: the icon and the count are not clickable in
 * the design, and a card-wide hit area would swallow the arrow link that is.
 */
function Stat({
  icon,
  tint,
  label,
  value,
  href,
  action,
}: {
  icon: string;
  tint: string;
  label: string;
  value: number;
  href: string;
  action: string;
}) {
  return (
    <div className="bg-surface flex items-center gap-3 px-4 py-3.5">
      <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${tint}`}>
        <Icon name={icon} size={22} filled />
      </span>

      <div className="min-w-0">
        <p className="text-on-surface-variant text-xs">{label}</p>
        <p className="text-on-surface text-title-lg leading-tight font-medium">{value}</p>
        <Link
          href={href}
          className="text-primary mt-0.5 inline-flex items-center gap-1 rounded-sm text-xs font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {action}
          <Icon name="arrow_forward" size={14} />
        </Link>
      </div>
    </div>
  );
}
