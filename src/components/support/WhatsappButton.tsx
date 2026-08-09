import { cn } from "@/lib/cn";
import { getStoreSettings } from "@/lib/settings/service";
import {
  inquiryMessage,
  whatsappHref,
  type InquiryContext,
} from "@/lib/whatsapp/link";

/**
 * Start a WhatsApp conversation, prefilled with what the shopper was looking
 * at.
 *
 * A server component, and an ordinary anchor: `wa.me` handles the rest — the
 * app on a phone, WhatsApp Web on a desktop. No client JavaScript, no device
 * sniffing, and the number never reaches the browser bundle as configuration.
 *
 * Renders **nothing** when `WHATSAPP_NUMBER` is unset or unusable. That is the
 * deliberate failure mode: a shop with no number configured simply has no
 * button, rather than one that opens WhatsApp on an error screen.
 */

/** The brand mark, so the button is recognisable at a glance. */
function WhatsappGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden
      className="shrink-0"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

export async function WhatsappButton({
  context = {},
  label = "Ask on WhatsApp",
  variant = "outlined",
  /** Show the admin's availability note under the button, where there is one. */
  showNote = true,
  className,
}: {
  /** What the shopper is looking at — see `InquiryContext`. */
  context?: InquiryContext;
  label?: string;
  /** `filled` for a page's main invitation, `outlined` beside another action. */
  variant?: "filled" | "outlined";
  showNote?: boolean;
  className?: string;
}) {
  /**
   * Read here rather than passed down from every page.
   *
   * `getStoreSettings` is `cache`-wrapped, so several buttons on one page cost
   * a single query — and no caller has to remember to thread configuration
   * through to a button three components deep.
   */
  const settings = await getStoreSettings();
  if (!settings.whatsappEnabled) return null;

  const href = whatsappHref(settings.whatsappNumber, inquiryMessage(context));
  if (!href) return null;

  return (
    <span className={cn("inline-flex flex-col gap-1.5", className)}>
      <a
        href={href}
        // Leaves the site, so a new tab — and `noopener` because a page opened
        // this way can otherwise reach back through `window.opener`.
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "state-layer inline-flex h-11 items-center justify-center gap-2 rounded-full px-5",
          "text-sm font-medium transition-all duration-200",
          "focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95",
          variant === "filled"
            ? // The brand green as a background, which is the one place it
              // belongs untouched. Both values are fixed, so the pairing holds
              // in either scheme — see the tokens in globals.css.
              "bg-whatsapp-fill text-on-whatsapp-fill hover:shadow-elevation-2"
            : // Green border and label rather than the neutral outline, so the
              // button reads as WhatsApp before the glyph is even parsed. This
              // token is the *readable* green and flips per scheme: the brand
              // #25D366 as text on a light surface scores 1.94:1.
              "border-whatsapp text-whatsapp hover:bg-whatsapp/[0.08] border",
        )}
      >
        <WhatsappGlyph size={variant === "filled" ? 20 : 18} />
        {label}
      </a>

      {showNote && settings.whatsappNote && (
        <span className="text-on-surface-variant text-center text-xs">
          {settings.whatsappNote}
        </span>
      )}
    </span>
  );
}
