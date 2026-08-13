import type { Metadata } from "next";
import Link from "next/link";

import { Navbar } from "@/components/nav/Navbar";
import { Footer } from "@/components/layout/Footer";
import { StoreCard } from "@/components/stores/StoreCard";
import { WhatsappButton } from "@/components/support/WhatsappButton";
import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { getNavData } from "@/lib/nav/data";
import { getPublishedStoreLocations } from "@/lib/stores/service";

export const metadata: Metadata = {
  title: "Stores · Ecom",
  description: "Where to find us — addresses, phone numbers and opening hours.",
};

export default async function StoresPage() {
  // Together rather than in sequence — neither depends on the other's result.
  // The store list is served from the cross-request cache (see
  // `lib/stores/service`), so on all but the first render after an edit this
  // resolves without touching the database at all.
  const [nav, stores] = await Promise.all([getNavData(), getPublishedStoreLocations()]);

  /**
   * Structured data, and the main reason branches deserve a page of their own.
   *
   * A local search — "electronics shop near me" — is answered from this markup,
   * not from the prose. It describes only what is rendered below, built from
   * the same `stores`, so the two cannot drift.
   *
   * `openingHours` is deliberately absent: the schema wants a machine format
   * (`Mo-Fr 10:00-19:00`) and what is stored is whatever the shop typed.
   * Guessing the conversion would publish a claim about when the door is open
   * that nobody checked, and being wrong about that sends someone to a closed
   * shop. The hours are on the page for a person to read.
   */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: stores.map((store, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Store",
        name: store.name,
        address: store.address.split("\n").join(", "),
        ...(store.description ? { description: store.description } : {}),
        ...(store.phone ? { telephone: store.phone } : {}),
        ...(store.latitude !== null && store.longitude !== null
          ? {
              geo: {
                "@type": "GeoCoordinates",
                latitude: store.latitude,
                longitude: store.longitude,
              },
            }
          : {}),
      },
    })),
  };

  return (
    <div className="bg-surface-container-low flex min-h-dvh flex-col">
      <Navbar {...nav} />

      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <div className="mb-8">
          <p className="eyebrow text-primary flex items-center gap-2">
            <Icon name="location_on" size={16} filled />
            Visit
          </p>
          <h1 className="text-on-surface text-headline-lg sm:text-display-sm mt-3">
            Come and{" "}
            <span className="accent-word">see us.</span>
          </h1>
          <p className="text-on-surface-variant mt-3 max-w-2xl text-sm">
            Addresses, phone numbers and opening hours for every branch. Ring
            ahead if you are coming for something specific — stock moves.
          </p>

          <WhatsappButton
            variant="filled"
            label="Ask before you visit"
            className="mt-5"
          />
        </div>

        {stores.length === 0 ? (
          <Card variant="outlined">
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <Icon name="storefront" size={40} className="text-on-surface-variant" />
              <p className="text-on-surface">No stores listed yet</p>
              <p className="text-on-surface-variant max-w-sm text-sm">
                Branches will appear here once they are added. Everything in the
                catalogue ships in the meantime.
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
            <div className="space-y-6">
              {stores.map((store) => (
                <StoreCard key={store.id} store={store} />
              ))}
            </div>

            {/* Emitted only when there is something to describe — an empty
                ItemList is a claim about content that is not there. */}
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
