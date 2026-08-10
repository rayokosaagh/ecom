import type { PaymentMethod } from "@/generated/prisma/enums";
import { Icon } from "@/components/ui/Icon";
import { PAYMENT_METHODS } from "@/lib/payments/methods";
import { readableOn } from "@/lib/social/color";
import { cn } from "@/lib/cn";

/**
 * The mark beside a payment method's name.
 *
 * Three shapes, in order of what is actually available:
 *
 *  1. **The provider's real artwork**, if someone has filled in `svgPath` from
 *     its brand kit.
 *  2. **Its name, in its own colour** — the default. Khalti, eSewa and
 *     connectIPS are none of them in Simple Icons, which is the only mark
 *     source this project trusts, and drawing an approximation of a payment
 *     brand's logo is precisely the misrepresentation
 *     `scripts/import-brand-icons` refuses to make. A wordmark set in the right
 *     colour is honest, recognisable, and wrong about nothing.
 *  3. **A Material Symbol**, for cash on delivery, which is not a brand at all.
 *
 * The foreground is contrast-picked by the same function the social bar uses,
 * so a light brand colour cannot produce unreadable text.
 */
export function PaymentMark({
  method,
  className,
}: {
  method: PaymentMethod;
  className?: string;
}) {
  const info = PAYMENT_METHODS[method];

  if (!info.brandColor) {
    return (
      <span
        className={cn(
          "bg-surface-container-highest text-on-surface-variant grid size-8 shrink-0 place-items-center rounded-md",
          className,
        )}
      >
        <Icon name={info.icon} size={18} />
      </span>
    );
  }

  const style = {
    backgroundColor: info.brandColor,
    color: readableOn(info.brandColor),
  };

  if (info.svgPath) {
    return (
      <span
        style={style}
        className={cn("grid size-8 shrink-0 place-items-center rounded-md", className)}
      >
        <svg aria-hidden viewBox="0 0 24 24" width={18} height={18} fill="currentColor">
          <path d={info.svgPath} />
        </svg>
      </span>
    );
  }

  return (
    <span
      aria-hidden
      style={style}
      // Tracking tightened and the box left to size itself: "connectIPS" is ten
      // characters and would be unreadable squeezed into the square a logo
      // would occupy.
      className={cn(
        "inline-flex h-8 shrink-0 items-center rounded-md px-2 text-[0.6875rem] font-semibold tracking-tight",
        className,
      )}
    >
      {info.wordmark}
    </span>
  );
}
