import type { Metadata } from "next";
import Link from "next/link";

import { Navbar } from "@/components/nav/Navbar";
import { Footer } from "@/components/layout/Footer";
import { FaqAccordion } from "@/components/faqs/FaqAccordion";
import { WhatsappButton } from "@/components/support/WhatsappButton";
import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { getNavData } from "@/lib/nav/data";
import { getPublishedFaqs } from "@/lib/faqs/service";

export const metadata: Metadata = {
  title: "Questions · Ecom",
  description: "Delivery, returns, orders and accounts — answered.",
};

export default async function FaqPage() {
  const [nav, faqs] = await Promise.all([getNavData(), getPublishedFaqs()]);

  /**
   * Structured data, and the main reason these deserve a page rather than only
   * a section on the home page.
   *
   * Google renders `FAQPage` as expandable answers directly in the result, so
   * the questions become an entry point rather than something found after
   * arriving. It has to describe what is actually on the page — marking up
   * answers a visitor cannot see is exactly what the spec forbids — which is
   * why it is built from the same `faqs` the accordion below renders.
   *
   * `answer` is plain text by design (see the schema), so it goes into `text`
   * unescaped-but-inert; `JSON.stringify` handles the quoting, and React's
   * `dangerouslySetInnerHTML` here receives JSON rather than markup.
   */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };

  return (
    <div className="bg-surface-container-low flex min-h-dvh flex-col">
      <Navbar {...nav} />

      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <div className="mb-8">
          <p className="eyebrow text-primary flex items-center gap-2">
            <Icon name="help" size={16} filled />
            Help
          </p>
          <h1 className="text-on-surface text-headline-lg sm:text-display-sm mt-3">
            Common{" "}
            <span className="accent-word">questions.</span>
          </h1>
          <p className="text-on-surface-variant mt-3 text-sm">
            Delivery, returns, orders and accounts. If something is not here,
            ask us directly and a person will answer.
          </p>

          {/* The other half of "ask us directly". Several answers on this page
              say to get in touch, and until now there was nowhere to do it —
              a promise with no mechanism behind it. Filled rather than
              outlined: on this page it is the primary action, not a companion
              to one. */}
          <WhatsappButton variant="filled" label="Ask us on WhatsApp" className="mt-5" />
        </div>

        {faqs.length === 0 ? (
          <Card variant="outlined">
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <Icon name="help" size={40} className="text-on-surface-variant" />
              <p className="text-on-surface">Nothing here yet</p>
              <p className="text-on-surface-variant max-w-sm text-sm">
                Questions will appear here as they are answered.
              </p>
              <Link
                href="/products"
                className="text-primary mt-1 rounded-sm text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Shop all products
              </Link>
            </CardContent>
          </Card>
        ) : (
          <>
            <FaqAccordion faqs={faqs} />

            {/* Emitted only when there is something to describe — an empty
                FAQPage is a claim about content that is not there. */}
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
