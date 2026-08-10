import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/prisma";
import type { ShippingValues } from "@/components/cart/CheckoutForm";

/**
 * Reading the address book.
 *
 * `cache()` rather than any cross-request cache: this is per-account data on an
 * authenticated page, and the same wrapper `getNavData` and `getCurrentUser`
 * already use here. It deduplicates within one render — the profile page lists
 * the book and separately asks which one is default, and checkout reads it
 * beside the cart — without ever serving one shopper's addresses to another.
 */

/** Only what any caller actually renders. `updatedAt` is nobody's business. */
const ADDRESS_SELECT = {
  id: true,
  label: true,
  name: true,
  line1: true,
  line2: true,
  city: true,
  region: true,
  postcode: true,
  country: true,
  phone: true,
  isDefault: true,
} as const;

export type SavedAddress = {
  id: string;
  label: string | null;
  name: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postcode: string;
  country: string;
  phone: string | null;
  isDefault: boolean;
};

/**
 * The whole book, default first.
 *
 * Not paginated, unlike order history: an address book is a handful of rows by
 * nature, and `MAX_ADDRESSES` caps it outright. Default first because that is
 * the one the reader is looking for, on the profile page and at checkout alike.
 */
export const getAddresses = cache(async (userId: string): Promise<SavedAddress[]> => {
  return prisma.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    select: ADDRESS_SELECT,
  });
});

/** One address, and only if it belongs to the account asking. */
export const getAddress = cache(
  async (id: string, userId: string): Promise<SavedAddress | null> => {
    // `userId` in the where clause, not checked after the read: a query that
    // cannot return somebody else's row is a stronger guarantee than one that
    // returns it and then remembers to compare.
    return prisma.address.findFirst({
      where: { id, userId },
      select: ADDRESS_SELECT,
    });
  },
);

/**
 * How many addresses one account may keep.
 *
 * A limit rather than none, for the same reason the upload paths are capped:
 * this is a table any signed-in account can write to. Ten is past what anybody
 * genuinely has and well short of a problem.
 */
export const MAX_ADDRESSES = 10;

/** A saved address in the shape the checkout form fills its fields from. */
export function toShippingValues(address: SavedAddress): ShippingValues {
  return {
    name: address.name,
    line1: address.line1,
    line2: address.line2 ?? "",
    city: address.city,
    region: address.region ?? "",
    postcode: address.postcode,
    country: address.country,
    phone: address.phone ?? "",
  };
}

/** One line, for listing an address without a block of eight rows. */
export function summarise(address: SavedAddress): string {
  return [address.line1, address.line2, address.city, address.region, address.postcode, address.country]
    .filter(Boolean)
    .join(", ");
}
