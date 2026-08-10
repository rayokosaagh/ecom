"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/dal";
import { parseAddressFields } from "@/lib/checkout/validation";
import { MAX_ADDRESSES } from "@/lib/addresses/service";

export type AddressFormState = {
  errors?: Record<string, string>;
  message?: string;
};

/**
 * Everything a saved address touches.
 *
 * The book is read on the profile page and again at checkout, and the default
 * decides what checkout preselects — so a change to any of it has to reach both.
 */
function revalidateAddressViews() {
  revalidatePath("/profile");
  revalidatePath("/checkout");
}

/**
 * Create or update one address.
 *
 * `id` is passed in by the page rather than read from the form, and every
 * write is scoped by `userId` — a form cannot name somebody else's row, because
 * the row it names is only ever looked for inside the caller's own book.
 */
export async function saveAddress(
  id: string | null,
  _prev: AddressFormState,
  formData: FormData,
): Promise<AddressFormState> {
  const user = await requireUser();

  const parsed = parseAddressFields(formData, "address");
  if (!parsed.ok) return { errors: parsed.errors };

  const labelRaw = String(formData.get("addressLabel") ?? "").trim();
  if (labelRaw.length > 40) {
    return { errors: { label: "Label must be 40 characters or fewer" } };
  }

  // Checkbox: absent when unticked.
  const makeDefault = formData.get("isDefault") === "on";

  const fields = {
    label: labelRaw || null,
    ...parsed.data,
  };

  if (id) {
    const existing = await prisma.address.findFirst({
      where: { id, userId: user.id },
      select: { id: true, isDefault: true },
    });
    if (!existing) return { message: "That address no longer exists." };

    await prisma.$transaction(async (tx) => {
      // Clearing the others first, so at no point are two rows both default.
      if (makeDefault) {
        await tx.address.updateMany({
          where: { userId: user.id, isDefault: true },
          data: { isDefault: false },
        });
      }
      await tx.address.update({
        where: { id },
        data: {
          ...fields,
          // Unticking the box on the row that *is* default would otherwise
          // leave the account with none, so the flag only ever goes up here.
          // Choosing a different default is what takes it down — see
          // `setDefaultAddress`.
          isDefault: makeDefault || existing.isDefault,
        },
      });
    });
  } else {
    const count = await prisma.address.count({ where: { userId: user.id } });
    if (count >= MAX_ADDRESSES) {
      return {
        message: `You can save up to ${MAX_ADDRESSES} addresses. Delete one to add another.`,
      };
    }

    await prisma.$transaction(async (tx) => {
      // The first address saved is the default whether or not the box was
      // ticked: an account with addresses and no default would give checkout
      // nothing to preselect, which is the whole point of the feature.
      const isDefault = makeDefault || count === 0;
      if (isDefault) {
        await tx.address.updateMany({
          where: { userId: user.id, isDefault: true },
          data: { isDefault: false },
        });
      }
      await tx.address.create({ data: { ...fields, userId: user.id, isDefault } });
    });
  }

  revalidateAddressViews();
  redirect("/profile#addresses");
}

/**
 * Save an address typed at checkout, if the shopper asked us to.
 *
 * Called after the order is committed, never before — the address book is a
 * convenience and must not be able to fail a sale. Silent on every failure for
 * the same reason: the order exists, and the receipt is what matters.
 *
 * Not a form action; `checkout` calls it directly with what it already parsed.
 */
export async function rememberAddress(
  userId: string,
  address: {
    name: string;
    line1: string;
    line2: string | null;
    city: string;
    region: string | null;
    postcode: string;
    country: string;
    phone: string | null;
  },
): Promise<void> {
  try {
    const count = await prisma.address.count({ where: { userId } });
    if (count >= MAX_ADDRESSES) return;

    // Nothing is saved twice. Compared on the lines that decide where a parcel
    // physically goes — a shopper who retyped their own name differently has
    // not moved house, and a second copy of one address is worse than a
    // slightly stale name on it.
    const duplicate = await prisma.address.findFirst({
      where: {
        userId,
        line1: address.line1,
        city: address.city,
        postcode: address.postcode,
        country: address.country,
      },
      select: { id: true },
    });
    if (duplicate) return;

    await prisma.address.create({
      data: { ...address, userId, isDefault: count === 0 },
    });
    revalidateAddressViews();
  } catch (error) {
    console.error("[addresses] could not save the address from checkout", error);
  }
}

export async function setDefaultAddress(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");

  const target = await prisma.address.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!target) return;

  await prisma.$transaction([
    prisma.address.updateMany({
      where: { userId: user.id, isDefault: true },
      data: { isDefault: false },
    }),
    prisma.address.update({ where: { id }, data: { isDefault: true } }),
  ]);

  revalidateAddressViews();
}

export async function deleteAddress(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");

  // Scoped by userId, so a forged id deletes nothing rather than somebody
  // else's address.
  const removed = await prisma.address.deleteMany({ where: { id, userId: user.id } });
  if (removed.count === 0) return;

  /**
   * Somebody has to be default.
   *
   * Deleting the default would otherwise leave checkout with a book full of
   * addresses and nothing preselected, which reads as the feature having
   * forgotten them. The newest survivor takes it — the same guess the account's
   * first address makes.
   */
  const stillDefault = await prisma.address.count({
    where: { userId: user.id, isDefault: true },
  });
  if (stillDefault === 0) {
    const next = await prisma.address.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (next) {
      await prisma.address.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  }

  revalidateAddressViews();
}
