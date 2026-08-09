import type { Validated } from "@/lib/auth/validation";
import { FulfilmentMethod } from "@/generated/prisma/enums";
import { isFulfilmentMethod } from "@/lib/checkout/fulfilment";

/**
 * Delivery address rules.
 *
 * Hand-rolled in the style of `products/validation` — there are no cross-field
 * rules or coercions here to justify a schema.
 *
 * Deliberately permissive on format. Postcodes, regions and phone numbers vary
 * enormously between countries, and a validator that insists on one shape is a
 * validator that rejects real addresses. Length and presence are checked; the
 * courier is a better judge of the rest.
 */

export type ShippingInput = {
  name: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postcode: string;
  country: string;
  phone: string | null;
};

const LIMITS = {
  name: 80,
  line1: 120,
  line2: 120,
  city: 60,
  region: 60,
  postcode: 16,
  country: 56,
  phone: 32,
} as const;

export function parseShipping(formData: FormData): Validated<ShippingInput> {
  const errors: Record<string, string> = {};

  const read = (field: keyof typeof LIMITS) =>
    String(formData.get(`shipping${field[0].toUpperCase()}${field.slice(1)}`) ?? "").trim();

  const name = read("name");
  const line1 = read("line1");
  const line2 = read("line2");
  const city = read("city");
  const region = read("region");
  const postcode = read("postcode");
  const country = read("country");
  const phone = read("phone");

  const require_ = (value: string, field: keyof typeof LIMITS, label: string) => {
    if (!value) errors[field] = `${label} is required`;
    else if (value.length > LIMITS[field]) {
      errors[field] = `${label} must be ${LIMITS[field]} characters or fewer`;
    }
  };

  const optional = (value: string, field: keyof typeof LIMITS, label: string) => {
    if (value.length > LIMITS[field]) {
      errors[field] = `${label} must be ${LIMITS[field]} characters or fewer`;
    }
  };

  require_(name, "name", "Full name");
  require_(line1, "line1", "Address");
  require_(city, "city", "City");
  require_(postcode, "postcode", "Postcode");
  require_(country, "country", "Country");

  optional(line2, "line2", "Address line 2");
  optional(region, "region", "State or region");
  optional(phone, "phone", "Phone");

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      name,
      line1,
      line2: line2 || null,
      city,
      region: region || null,
      postcode,
      country,
      phone: phone || null,
    },
  };
}

/**
 * What checkout collected, by method.
 *
 * A discriminated union rather than one shape with everything optional. The two
 * branches genuinely require different things — a delivery needs a postcode and
 * a pickup does not — and a single shape with eight nullable fields pushes that
 * distinction out to every reader, each of which then has to remember which
 * fields are meaningful for which method. Here the compiler remembers.
 */
export type FulfilmentInput =
  | { method: typeof FulfilmentMethod.DELIVERY; address: ShippingInput }
  | {
      method: typeof FulfilmentMethod.PICKUP;
      /** Who is coming for it. The address lines stay null — see Order. */
      contact: { name: string; phone: string | null };
    };

/**
 * Read the whole fulfilment choice off the form.
 *
 * The method is decided first and everything else follows from it, which is the
 * point: validating the address regardless and ignoring it afterwards would
 * reject a perfectly good collection order for having no postcode. The fields
 * are still *present* in the DOM when collection is chosen — hiding a fieldset
 * does not unmount it — so "ignore them" has to be a decision made here rather
 * than assumed from an empty payload.
 *
 * An unrecognised or missing method falls back to DELIVERY rather than
 * erroring. It is the default on the column, the default on the form, and what
 * every order predating this feature was; a shopper whose radio failed to
 * submit should get the ordinary path, not a validation message about a control
 * they never knowingly used.
 *
 * `pickupOffered` is passed in rather than read here, because whether the shop
 * has a counter is a database fact and this module has no database. A form
 * claiming PICKUP at a shop that does not offer it is refused rather than
 * quietly downgraded to delivery — that would post an order to an address the
 * shopper deliberately declined to give.
 */
export function parseFulfilment(
  formData: FormData,
  pickupOffered: boolean,
): Validated<FulfilmentInput> {
  const raw = String(formData.get("fulfilment") ?? "").trim();
  const method =
    raw && isFulfilmentMethod(raw) ? raw : FulfilmentMethod.DELIVERY;

  if (method === FulfilmentMethod.DELIVERY) {
    const address = parseShipping(formData);
    if (!address.ok) return { ok: false, errors: address.errors };
    return { ok: true, data: { method, address: address.data } };
  }

  if (!pickupOffered) {
    return {
      ok: false,
      errors: {
        fulfilment:
          "Collection is not available at the moment. Choose home delivery instead.",
      },
    };
  }

  const errors: Record<string, string> = {};
  const name = String(formData.get("pickupName") ?? "").trim();
  const phone = String(formData.get("pickupPhone") ?? "").trim();

  // The one field collection genuinely needs: somebody has to be asked for at
  // the counter, and "the account holder" is not always who turns up.
  if (!name) errors.name = "Full name is required";
  else if (name.length > LIMITS.name) {
    errors.name = `Full name must be ${LIMITS.name} characters or fewer`;
  }

  if (phone.length > LIMITS.phone) {
    errors.phone = `Phone must be ${LIMITS.phone} characters or fewer`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return { ok: true, data: { method, contact: { name, phone: phone || null } } };
}
