import type { Metadata } from "next";

import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import {
  BLANK_DISCOUNT,
  DiscountForm,
  type DiscountFormValues,
} from "@/components/discounts/DiscountForm";
import { DiscountRowActions } from "@/components/discounts/DiscountRowActions";
import { requireAdmin } from "@/lib/auth/dal";
import { getDiscountCode, getDiscountCodes } from "@/lib/discounts/service";
import { formatPrice } from "@/lib/products/format";
import { cn } from "@/lib/cn";
import { DiscountKind } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Discounts" };

/** `datetime-local` wants "YYYY-MM-DDTHH:mm" in local time. */
function toLocalInput(date: Date | null): string {
  if (!date) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/** What a code is worth, said the way it would be read aloud. */
function describe(code: {
  kind: DiscountKind;
  value: number;
  maxDiscountCents: number | null;
}): string {
  if (code.kind === DiscountKind.FIXED) return `${formatPrice(code.value)} off`;
  const cap = code.maxDiscountCents
    ? `, up to ${formatPrice(code.maxDiscountCents)}`
    : "";
  return `${code.value}% off${cap}`;
}

export default async function AdminDiscountsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  // The layout checks the session, but layouts do not re-render on every
  // navigation — so the page enforces the admin gate itself.
  await requireAdmin();

  const { edit } = await searchParams;
  const [codes, editing] = await Promise.all([
    getDiscountCodes(),
    edit ? getDiscountCode(edit) : Promise.resolve(null),
  ]);

  const initial: DiscountFormValues = editing
    ? {
        id: editing.id,
        code: editing.code,
        kind: editing.kind,
        percent: editing.kind === DiscountKind.PERCENT ? String(editing.value) : "10",
        amount:
          editing.kind === DiscountKind.FIXED ? (editing.value / 100).toFixed(2) : "",
        minSubtotal: editing.minSubtotalCents
          ? (editing.minSubtotalCents / 100).toFixed(2)
          : "",
        maxDiscount: editing.maxDiscountCents
          ? (editing.maxDiscountCents / 100).toFixed(2)
          : "",
        startsAt: toLocalInput(editing.startsAt),
        endsAt: toLocalInput(editing.endsAt),
        maxRedemptions: editing.maxRedemptions ? String(editing.maxRedemptions) : "",
        oncePerCustomer: editing.oncePerCustomer,
        active: editing.active,
      }
    : BLANK_DISCOUNT;

  const now = new Date();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="text-on-surface text-2xl font-normal">Discounts</h2>
        <p className="text-on-surface-variant mt-1 text-sm">
          Codes are checked when a shopper applies one and again when they pay, so
          a code that lapses in between is simply not honoured.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <Card variant="outlined" className="h-fit">
          <CardContent>
            <h3 className="text-on-surface mb-4 text-sm font-medium">
              {editing ? `Editing ${editing.code}` : "New code"}
            </h3>
            {/* Keyed so switching between codes rebuilds the uncontrolled
                inputs instead of keeping the previous one's values. */}
            <DiscountForm key={editing?.id ?? "new"} initial={initial} />
          </CardContent>
        </Card>

        <div className="space-y-3">
          {codes.length === 0 ? (
            <Card variant="outlined">
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <Icon name="sell" size={40} className="text-on-surface-variant" />
                <p className="text-on-surface">No codes yet</p>
                <p className="text-on-surface-variant max-w-sm text-sm">
                  Create one on the left and it becomes usable in the cart
                  immediately.
                </p>
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-3">
              {codes.map((code) => {
                const expired = code.endsAt !== null && code.endsAt < now;
                const pending = code.startsAt !== null && code.startsAt > now;
                const usedUp =
                  code.maxRedemptions !== null &&
                  code.redemptions >= code.maxRedemptions;

                return (
                  <li key={code.id}>
                    <Card variant="outlined">
                      <div className="flex flex-wrap items-start gap-4 p-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <a
                              href={`/admin/discounts?edit=${code.id}`}
                              className="text-on-surface rounded-sm font-mono text-sm font-medium hover:underline focus-visible:outline-2"
                            >
                              {code.code}
                            </a>
                            <span className="text-on-surface-variant text-sm">
                              {describe(code)}
                            </span>

                            {/* Only the state that is actually stopping it. */}
                            {!code.active ? (
                              <Badge tone="error" icon="toggle_off">
                                Off
                              </Badge>
                            ) : expired ? (
                              <Badge tone="error" icon="event_busy">
                                Expired
                              </Badge>
                            ) : pending ? (
                              <Badge tone="neutral" icon="schedule">
                                Not yet live
                              </Badge>
                            ) : usedUp ? (
                              <Badge tone="error" icon="block">
                                Fully claimed
                              </Badge>
                            ) : (
                              <Badge tone="ok" icon="check_circle">
                                Live
                              </Badge>
                            )}
                          </div>

                          <p className="text-on-surface-variant mt-1 text-xs">
                            {code.minSubtotalCents > 0 &&
                              `Min spend ${formatPrice(code.minSubtotalCents)} · `}
                            {code.oncePerCustomer
                              ? "One per customer"
                              : "Reusable per customer"}
                            {" · "}
                            {code.redemptions} used
                            {code.maxRedemptions !== null &&
                              ` of ${code.maxRedemptions}`}
                          </p>

                          {(code.startsAt || code.endsAt) && (
                            <p className="text-on-surface-variant mt-0.5 text-xs">
                              {code.startsAt &&
                                `From ${code.startsAt.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}`}
                              {code.startsAt && code.endsAt && " "}
                              {code.endsAt &&
                                `until ${code.endsAt.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}`}
                            </p>
                          )}
                        </div>

                        <DiscountRowActions
                          id={code.id}
                          active={code.active}
                          used={code._count.orders}
                        />
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Badge({
  tone,
  icon,
  children,
}: {
  tone: "ok" | "error" | "neutral";
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "ok" && "bg-tertiary-container text-on-tertiary-container",
        tone === "error" && "bg-error-container text-on-error-container",
        tone === "neutral" && "bg-surface-container-highest text-on-surface-variant",
      )}
    >
      <Icon name={icon} size={12} />
      {children}
    </span>
  );
}
