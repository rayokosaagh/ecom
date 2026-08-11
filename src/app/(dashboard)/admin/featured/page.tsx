import type { Metadata } from "next";

import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import {
  FeaturedList,
  type FeaturableOption,
  type FeaturedRow,
} from "@/components/products/FeaturedList";
import { requireAdmin } from "@/lib/auth/dal";
import { getFeaturableProducts, getFeaturedForAdmin } from "@/lib/featured/service";

export const metadata: Metadata = { title: "Featured products" };

export default async function AdminFeaturedPage() {
  // The layout checks the session, but layouts do not re-render on every
  // navigation — so the page enforces the admin gate itself.
  await requireAdmin();

  const [featured, featurable] = await Promise.all([
    getFeaturedForAdmin(),
    getFeaturableProducts(),
  ]);

  const rows: FeaturedRow[] = featured.map((row) => ({
    id: row.id,
    productId: row.product.id,
    name: row.product.name,
    image: row.product.image,
    brand: row.product.brand?.name ?? null,
    published: row.product.published,
    tint: row.tint,
  }));

  const options: FeaturableOption[] = featurable.map((product) => ({
    id: product.id,
    name: product.name,
    published: product.published,
    brand: product.brand?.name ?? null,
  }));

  const live = rows.filter((row) => row.published).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="text-on-surface text-2xl font-normal">Featured products</h2>
        <p className="text-on-surface-variant mt-1 text-sm">
          {rows.length === 0
            ? "The showcase at the top of the home page."
            : `${live} of ${rows.length} showing on the home page right now.`}
        </p>
      </div>

      {rows.length === 0 ? (
        <>
          <Card variant="outlined">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <Icon name="stars" size={40} className="text-on-surface-variant" />
              <p className="text-on-surface">Nothing featured yet</p>
              <p className="text-on-surface-variant max-w-sm text-sm">
                Pick a few products to show above the catalogue. The section is
                hidden entirely while this list is empty, so the home page never
                shows an empty shelf.
              </p>
            </CardContent>
          </Card>
          <FeaturedList rows={rows} options={options} />
        </>
      ) : (
        <FeaturedList rows={rows} options={options} />
      )}
    </div>
  );
}
