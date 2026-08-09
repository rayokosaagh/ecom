"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/dal";
import { parseFlashSale } from "@/lib/flash/validation";
import { reconcileFlashSales, withSaleClosed } from "@/lib/flash/service";

export type FlashSaleFormState = {
  errors?: Record<string, string>;
  message?: string;
};

const LIST_PATH = "/admin/flash-sales";

/**
 * Refresh every surface a flash price can appear on.
 *
 * Deliberately broad, and broader than the other promo features need to be:
 * a flash sale rewrites `Product.priceCents`, so it changes the catalogue's
 * sort order and the figures on every card, not just the section advertising
 * it. Anything showing a price is stale after one of these runs.
 */
function revalidateFlashViews(productSlugs: string[] = []) {
  revalidatePath("/");
  revalidatePath("/products");
  revalidatePath("/sale");
  revalidatePath("/cart");
  revalidatePath("/dashboard/products");
  revalidatePath(LIST_PATH);
  for (const slug of productSlugs) revalidatePath(`/products/${slug}`);
}

/** Slugs of every product in a sale, for targeted revalidation. */
async function productSlugsForSale(saleId: string): Promise<string[]> {
  const items = await prisma.flashSaleItem.findMany({
    where: { flashSaleId: saleId },
    select: { product: { select: { slug: true } } },
  });
  return items.map((item) => item.product.slug);
}

export async function createFlashSale(
  _prev: FlashSaleFormState,
  formData: FormData,
): Promise<FlashSaleFormState> {
  // Every mutation re-checks the role against the database, not the JWT.
  await requireAdmin();

  const parsed = parseFlashSale(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const sale = await prisma.flashSale.create({
    data: parsed.data,
    select: { id: true },
  });

  // A new sale has no products, so nothing can be applied yet — but reconciling
  // keeps the one entry point honest rather than relying on that staying true.
  await reconcileFlashSales();
  revalidateFlashViews();

  // Straight to the edit screen: a sale with no products in it is not finished,
  // and the list would just be a row to click back into.
  redirect(`${LIST_PATH}/${sale.id}/edit`);
}

export async function updateFlashSale(
  id: string,
  _prev: FlashSaleFormState,
  formData: FormData,
): Promise<FlashSaleFormState> {
  await requireAdmin();

  const parsed = parseFlashSale(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const current = await prisma.flashSale.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!current) return { message: "That sale no longer exists." };

  const slugs = await productSlugsForSale(id);

  // The percentage or the window may have moved, either of which changes what
  // should be written — so the change is made with prices back at their
  // originals and the sale reopened from there.
  await withSaleClosed(id, () =>
    prisma.flashSale.update({ where: { id }, data: parsed.data }),
  );

  revalidateFlashViews(slugs);
  redirect(LIST_PATH);
}

/**
 * Delete a sale.
 *
 * Closed first, always. `FlashSaleItem` cascades with the sale, and those rows
 * carry the only record of what each product used to cost — deleting before
 * restoring would leave every product in the sale permanently discounted with
 * nothing left to say what it should be.
 */
export async function deleteFlashSale(id: string): Promise<void> {
  await requireAdmin();
  if (!id) return;

  const slugs = await productSlugsForSale(id);

  await withSaleClosed(id, () => prisma.flashSale.deleteMany({ where: { id } }));

  revalidateFlashViews(slugs);
}

/** The off switch. Pulling a live sale restores its prices immediately. */
export async function setFlashSaleActive(id: string, active: boolean): Promise<void> {
  await requireAdmin();
  if (!id) return;

  const slugs = await productSlugsForSale(id);

  await prisma.flashSale.updateMany({ where: { id }, data: { active } });

  // Not `withSaleClosed`: switching off makes `shouldBeLive` false, so an
  // ordinary reconcile is what closes it — and switching back on inside the
  // window is what reopens it. The state machine already covers both.
  await reconcileFlashSales();

  revalidateFlashViews(slugs);
}

export async function addFlashSaleProduct(
  saleId: string,
  _prev: FlashSaleFormState,
  formData: FormData,
): Promise<FlashSaleFormState> {
  await requireAdmin();

  const productId = String(formData.get("productId") ?? "").trim();
  if (!productId) return { message: "Choose a product to add." };

  const [sale, product] = await Promise.all([
    prisma.flashSale.findUnique({ where: { id: saleId }, select: { id: true } }),
    prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, slug: true },
    }),
  ]);

  if (!sale) return { message: "That sale no longer exists." };
  if (!product) return { message: "That product no longer exists." };

  // Guarded here as well as in `getFlashableProducts`, because the option list
  // was rendered before this click. Two sales writing one product's price would
  // each snapshot the other's figure as the original, and closing them in the
  // wrong order would bake the discount in for good.
  const inAppliedSale = await prisma.flashSaleItem.findFirst({
    where: { productId, flashSale: { appliedAt: { not: null } }, NOT: { flashSaleId: saleId } },
    select: { id: true },
  });
  if (inAppliedSale) {
    return { message: "That product is already in a flash sale that is running." };
  }

  await withSaleClosed(saleId, async () => {
    // Tolerates a double submit rather than erroring on the unique constraint.
    await prisma.flashSaleItem.createMany({
      data: [{ flashSaleId: saleId, productId }],
      skipDuplicates: true,
    });
  });

  revalidateFlashViews([product.slug]);
  return {};
}

/**
 * Take one product out of a sale.
 *
 * The close-first ordering is the whole point — see `withSaleClosed`. Removing
 * the row before restoring would strand this product at its sale price.
 */
export async function removeFlashSaleProduct(itemId: string): Promise<void> {
  await requireAdmin();
  if (!itemId) return;

  const item = await prisma.flashSaleItem.findUnique({
    where: { id: itemId },
    select: { flashSaleId: true, product: { select: { slug: true } } },
  });
  if (!item) return;

  await withSaleClosed(item.flashSaleId, () =>
    prisma.flashSaleItem.deleteMany({ where: { id: itemId } }),
  );

  revalidateFlashViews([item.product.slug]);
}
