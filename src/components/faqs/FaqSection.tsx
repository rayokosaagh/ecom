import Link from "next/link";

import { FaqAccordion } from "@/components/faqs/FaqAccordion";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { getPublishedFaqs } from "@/lib/faqs/service";

/**
 * Questions, near the bottom of the storefront.
 *
 * Objection handling, and that is what fixes its position: someone who has
 * scrolled this far has seen everything there is to buy and has not clicked. A
 * question is the most likely reason, and the cheapest place to answer it is
 * before they leave rather than on a page they would have to go and find.
 *
 * A few of them, not all. `/faq` is the complete list and carries the
 * `FAQPage` structured data that makes it worth having its own URL; this is a
 * sample with a way through to the rest. Answering everything here would push
 * the footer another screen down for a page nobody arrived at to read policy.
 *
 * Fetches its own data, so adding it to a page is one line, and renders nothing
 * at all when no FAQ is published — the same rule the promo banners and the
 * social bar follow, so an empty shop never shows an empty band.
 */

/** Enough to look answered, short enough to stay a footnote. */
const HOME_FAQ_LIMIT = 5;

export async function FaqSection({ className }: { className?: string }) {
  const faqs = await getPublishedFaqs(HOME_FAQ_LIMIT);
  if (faqs.length === 0) return null;

  return (
    <section
      aria-labelledby="home-faq-heading"
      className={cn("mx-auto max-w-3xl px-4 pb-24 sm:px-6", className)}
    >
      <div className="mb-6">
        <p className="text-primary flex items-center gap-2 text-xs font-medium tracking-[0.25em] uppercase">
          <Icon name="help" size={16} filled />
          Help
        </p>
        <div className="mt-3 flex items-end justify-between gap-4">
          <h2
            id="home-faq-heading"
            className="text-on-surface text-3xl font-medium tracking-tight"
          >
            Common <span className="accent-word">questions</span>
          </h2>
          <Link
            href="/faq"
            className="text-primary shrink-0 rounded-sm text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            All questions
          </Link>
        </div>
      </div>

      <FaqAccordion faqs={faqs} />
    </section>
  );
}
