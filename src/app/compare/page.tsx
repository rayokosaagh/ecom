import type { Metadata } from "next";
import Link from "next/link";

import { Navbar } from "@/components/nav/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { CompareTable } from "@/components/products/CompareTable";
import { getNavData } from "@/lib/nav/data";
import { prisma } from "@/lib/prisma";
import { getRootCategories } from "@/lib/categories/tree";
import { formatPrice } from "@/lib/products/format";
import { priceRange, availableStock } from "@/lib/products/variants";
import {
  buildComparison,
  countDifferences,
  MAX_COMPARE,
  type CompareProductSource,
  type CompareSpecSource,
} from "@/lib/products/compare";

export const metadata: Metadata = {
  title: "Compare",
  description: "Put products side by side.",
};

type Params = { ids?: string };

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;

  const slugs = [
    ...new Set(
      (params.ids ?? "")
        .split(",")
        .map((slug) => slug.trim())
        .filter(Boolean),
    ),
  ].slice(0, MAX_COMPARE);

  const [nav, found, roots] = await Promise.all([
    getNavData(),
    slugs.length > 0
      ? prisma.product.findMany({
          where: { slug: { in: slugs }, published: true },
          select: {
            id: true,
            slug: true,
            name: true,
            image: true,
            priceCents: true,
            stock: true,
            categoryId: true,
            category: { select: { name: true } },
            brand: { select: { name: true, iconSvg: true, logo: true, logoTreatment: true } },
            specs: {
              select: {
                definitionId: true,
                value: true,
                valueKey: true,
                definition: {
                  select: {
                    label: true,
                    unit: true,
                    group: true,
                    icon: true,
                    sortOrder: true,
                  },
                },
              },
            },
            variants: {
              select: {
                priceCents: true,
                stock: true,
                options: {
                  select: {
                    definitionId: true,
                    value: true,
                    valueKey: true,
                    definition: {
                      select: {
                        label: true,
                        unit: true,
                        group: true,
                        icon: true,
                        sortOrder: true,
                      },
                    },
                  },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
    getRootCategories(),
  ]);

  // Restore the order the shopper picked them in; the query returns whatever
  // order the database liked.
  const ordered = slugs.flatMap((slug) => {
    const product = found.find((candidate) => candidate.slug === slug);
    return product ? [product] : [];
  });

  /**
   * The category lock, enforced here rather than only in the picker.
   *
   * The selection UI already prevents mixing, but this page is reachable by a
   * hand-typed or edited URL and a comparison of a laptop against a pair of
   * headphones is meaningless — the rows would share almost no labels and the
   * few they did share would not be answering the same question.
   *
   * Locked to the *top-level* ancestor, so "Student Laptops" and "Ultrabooks"
   * compare happily while Audio never joins them.
   */
  const anchor = ordered[0]
    ? (ordered[0].categoryId ? roots.get(ordered[0].categoryId) : undefined)
    : undefined;
  const anchorId = anchor?.id ?? ordered[0]?.categoryId ?? null;

  const products = ordered.filter((product) => {
    const root = product.categoryId ? roots.get(product.categoryId) : undefined;
    return (root?.id ?? product.categoryId ?? null) === anchorId;
  });

  const rejected = ordered.length - products.length;

  const sources: CompareProductSource[] = products.map((product) => {
    const fixed: CompareSpecSource[] = product.specs.map((spec) => ({
      definitionId: spec.definitionId,
      label: spec.definition.label,
      unit: spec.definition.unit,
      group: spec.definition.group,
      icon: spec.definition.icon,
      sortOrder: spec.definition.sortOrder,
      value: spec.value,
      valueKey: spec.valueKey,
    }));

    // Variant axes are specs too, and a product that is *sold* in 8 and 16 GB
    // has to compare against one that simply has 16 — so both sources are
    // flattened into the same list.
    const varying: CompareSpecSource[] = product.variants.flatMap((variant) =>
      variant.options.map((option) => ({
        definitionId: option.definitionId,
        label: option.definition.label,
        unit: option.definition.unit,
        group: option.definition.group,
        icon: option.definition.icon,
        sortOrder: option.definition.sortOrder,
        value: option.value,
        valueKey: option.valueKey,
      })),
    );

    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      image: product.image,
      brand: product.brand,
      specs: [...fixed, ...varying],
    };
  });

  const groups = buildComparison(sources);
  const differences = countDifferences(groups);

  const headers = products.map((product) => {
    const range = priceRange(product, product.variants);
    return {
      slug: product.slug,
      name: product.name,
      image: product.image,
      brand: product.brand,
      category: product.category?.name ?? null,
      price: range.varies
        ? `From ${formatPrice(range.minCents)}`
        : formatPrice(range.minCents),
      soldOut: availableStock(product, product.variants) === 0,
    };
  });

  return (
    <div className="bg-surface-container-low flex min-h-dvh flex-col">
      <Navbar {...nav} />

      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
        <p className="eyebrow text-primary flex items-center gap-2">
          <Icon name="balance" size={16} filled />
          {anchor?.name ?? "Compare"}
        </p>

        <h1 className="text-on-surface text-headline-lg sm:text-display-sm mt-4">
          Side by{" "}
          <span className="accent-word">
            side.
          </span>
        </h1>

        {rejected > 0 && (
          <p
            role="status"
            className="bg-surface-container-highest text-on-surface-variant mt-6 flex items-start gap-2 rounded-lg px-4 py-3 text-sm"
          >
            <Icon name="info" size={18} />
            <span>
              {rejected === 1 ? "One product was" : `${rejected} products were`} left
              out — comparison is limited to one category at a time, and{" "}
              {rejected === 1 ? "it was not" : "they were not"} in{" "}
              {anchor?.name ?? "this one"}.
            </span>
          </p>
        )}

        {products.length < 2 ? (
          <Card variant="outlined" className="mt-8">
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <Icon name="balance" size={40} className="text-on-surface-variant" />
              <p className="text-on-surface">
                {products.length === 0
                  ? "Nothing to compare"
                  : "Pick one more product"}
              </p>
              <p className="text-on-surface-variant max-w-sm text-sm">
                Choose up to {MAX_COMPARE} products from the same category, then
                come back here to see them side by side.
              </p>
              <Link
                href="/products"
                className="text-primary rounded-sm text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Browse products
              </Link>
            </CardContent>
          </Card>
        ) : (
          <CompareTable
            headers={headers}
            groups={groups}
            differences={differences}
          />
        )}
      </main>

      <Footer />
    </div>
  );
}
