import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { FilterPills } from "@/components/admin/FilterPills";
import { ListToolbar } from "@/components/admin/ListToolbar";
import { requireUser, isAdmin } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/products/format";
import { toggleProductPublished } from "@/lib/actions/products";
import type { Prisma } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Products" };

interface ProductListParams {
  q?: string;
  status?: string;
  category?: string;
  brand?: string;
  stock?: string;
}

export default async function DashboardProductsPage({
  searchParams,
}: {
  searchParams: Promise<ProductListParams>;
}) {
  await requireUser();
  const admin = await isAdmin();

  const params = await searchParams;
  const query = params.q?.trim() ?? "";

  // Non-admins only ever see published products, whatever the URL says — the
  // status filter narrows that set, it can never widen it.
  const visibility: Prisma.ProductWhereInput = admin ? {} : { published: true };

  const status = admin && (params.status === "draft" || params.status === "published")
    ? params.status
    : undefined;

  const stock = params.stock === "in" || params.stock === "out" ? params.stock : undefined;

  const where: Prisma.ProductWhereInput = {
    ...visibility,
    ...(status ? { published: status === "published" } : {}),
    ...(stock ? { stock: stock === "in" ? { gt: 0 } : { lte: 0 } } : {}),
    ...(params.category ? { category: { slug: params.category } } : {}),
    ...(params.brand ? { brand: { slug: params.brand } } : {}),
    // Slug as well as name so a URL pasted from the storefront finds its row.
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { slug: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [products, categories, brands, counts] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        slug: true,
        name: true,
        image: true,
        priceCents: true,
        stock: true,
        published: true,
        category: { select: { name: true } },
      },
    }),
    prisma.category.findMany({
      orderBy: { name: "asc" },
      select: { slug: true, name: true },
    }),
    prisma.brand.findMany({
      orderBy: { name: "asc" },
      select: { slug: true, name: true },
    }),
    // Counts for the status pills. Deliberately ignore `status` itself — a rail
    // that recounted under its own filter would show "Draft 0" while standing
    // on Published, which reads as "there are none" rather than "not these".
    admin
      ? prisma.product.groupBy({
          by: ["published"],
          where: { ...where, published: undefined },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  const publishedCount = counts.find((row) => row.published)?._count._all ?? 0;
  const draftCount = counts.find((row) => !row.published)?._count._all ?? 0;

  // What the visitor asked for, minus anything they are not allowed to ask for.
  const filtered = Boolean(query || status || stock || params.category || params.brand);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-on-surface text-2xl font-normal">Products</h2>
          <p className="text-on-surface-variant mt-1 text-sm">
            {admin ? "All products, including drafts." : "Published products."}
          </p>
        </div>
      </div>

      <ListToolbar
        searchLabel="Search products by name or slug"
        alsoClear={["status"]}
        filters={[
          {
            param: "category",
            label: "Category",
            options: categories.map((c) => ({ value: c.slug, label: c.name })),
          },
          {
            param: "brand",
            label: "Brand",
            options: brands.map((b) => ({ value: b.slug, label: b.name })),
          },
          {
            param: "stock",
            label: "Stock",
            options: [
              { value: "in", label: "In stock" },
              { value: "out", label: "Out of stock" },
            ],
          },
        ]}
        action={
          admin && (
            <Link
              href="/dashboard/products/new"
              className="bg-primary text-on-primary state-layer inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-6 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
            >
              <Icon name="add" size={18} />
              Add product
            </Link>
          )
        }
      />

      {admin && (
        <FilterPills
          label="Filter by publication status"
          param="status"
          basePath="/dashboard/products"
          params={params as Record<string, string | undefined>}
          options={[
            { value: "", label: "All", count: publishedCount + draftCount },
            { value: "published", label: "Published", count: publishedCount },
            { value: "draft", label: "Draft", count: draftCount },
          ]}
        />
      )}

      {products.length === 0 ? (
        <Card variant="outlined">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Icon
              name={filtered ? "search_off" : "inventory_2"}
              size={40}
              className="text-on-surface-variant"
            />
            <p className="text-on-surface">
              {filtered ? "Nothing matches those filters" : "No products yet"}
            </p>
            <p className="text-on-surface-variant max-w-sm text-sm">
              {filtered
                ? "Try a shorter search, or clear a filter to widen the results."
                : admin
                  ? "Add your first product to see it on the storefront."
                  : "Nothing published yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-on-surface-variant px-1 text-xs">
            {products.length} product{products.length === 1 ? "" : "s"}
            {filtered && " matching"}
          </p>

          <Card variant="outlined" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-left text-sm">
                <thead className="text-on-surface-variant border-outline-variant border-b">
                  <tr>
                    <th scope="col" className="px-6 py-3 font-medium">Product</th>
                    <th scope="col" className="px-6 py-3 font-medium">Category</th>
                    <th scope="col" className="px-6 py-3 font-medium">Price</th>
                    <th scope="col" className="px-6 py-3 font-medium">Stock</th>
                    {admin && (
                      <>
                        <th scope="col" className="px-6 py-3 font-medium">Status</th>
                        <th scope="col" className="px-6 py-3 font-medium">
                          <span className="sr-only">Actions</span>
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr
                      key={product.id}
                      className="border-outline-variant hover:bg-on-surface/[0.04] border-b transition-colors duration-200 last:border-0"
                    >
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          <div className="bg-surface-container-highest size-10 shrink-0 overflow-hidden rounded-md">
                            {product.image ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={product.image}
                                alt=""
                                className="size-full object-cover"
                              />
                            ) : (
                              <div className="text-on-surface-variant grid size-full place-items-center">
                                <Icon name="image" size={18} />
                              </div>
                            )}
                          </div>
                          <span className="text-on-surface">{product.name}</span>
                        </div>
                      </td>
                      <td className="text-on-surface-variant px-6 py-3">
                        {product.category?.name ?? "—"}
                      </td>
                      <td className="text-on-surface-variant px-6 py-3">
                        {formatPrice(product.priceCents)}
                      </td>
                      <td className="text-on-surface-variant px-6 py-3">{product.stock}</td>

                      {admin && (
                        <>
                          <td className="px-6 py-3">
                            <form action={toggleProductPublished}>
                              <input type="hidden" name="id" value={product.id} />
                              <button
                                type="submit"
                                title="Toggle published"
                                className={
                                  product.published
                                    ? "bg-tertiary-container text-on-tertiary-container rounded-full px-3 py-1 text-xs transition-opacity duration-200 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2"
                                    : "bg-surface-container-highest text-on-surface-variant rounded-full px-3 py-1 text-xs transition-opacity duration-200 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2"
                                }
                              >
                                {product.published ? "Published" : "Draft"}
                              </button>
                            </form>
                          </td>
                          <td className="px-6 py-3 text-right">
                            <Link
                              href={`/dashboard/products/${product.id}/edit`}
                              aria-label={`Edit ${product.name}`}
                              className="text-on-surface-variant hover:bg-on-surface/[0.08] inline-grid size-9 place-items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2"
                            >
                              <Icon name="edit" size={18} />
                            </Link>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
