import type { Validated } from "@/lib/auth/validation";

/**
 * Admin form rules for one branch.
 *
 * Deliberately free of `server-only` and of any database access, like every
 * other `parse*` in this codebase — `npm run check:stores` exercises it
 * directly.
 */

/** Long enough for "Kathmandu · New Road", short enough to stay a heading. */
export const MAX_NAME_LENGTH = 80;

/** A few lines of street address, not an essay. */
export const MAX_ADDRESS_LENGTH = 300;

/** A sentence or two. The page is a directory, not an about page. */
export const MAX_DESCRIPTION_LENGTH = 400;

export const MAX_PHONE_LENGTH = 32;

export const MAX_HOURS_LENGTH = 400;

/** A week, plus a couple of notes. Past this it is not an hours table. */
export const MAX_HOURS_LINES = 12;

/**
 * What counts as a phone number.
 *
 * Intentionally permissive, for the same reason `EMAIL_PATTERN` is: the only
 * proof a number works is ringing it. This catches a name typed into the wrong
 * field, not a wrong digit. Anything the ITU allows plus the punctuation people
 * actually use, and at least six digits somewhere in it.
 */
const PHONE_ALLOWED = /^[+()\-.\s\d/]+$/;
const PHONE_MIN_DIGITS = 6;

export type StoreLocationInput = {
  name: string;
  address: string;
  description: string | null;
  phone: string | null;
  hours: string | null;
  latitude: number | null;
  longitude: number | null;
  published: boolean;
};

/** Textareas submit CRLF; the stored text and the length check use one form. */
function normalizeLines(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

/** Empty optional fields are stored as null, never as "". */
function orNull(value: string): string | null {
  return value || null;
}

export function parseStoreLocation(formData: FormData): Validated<StoreLocationInput> {
  const errors: Record<string, string> = {};

  const name = String(formData.get("name") ?? "").trim();
  const address = normalizeLines(String(formData.get("address") ?? ""));
  const description = String(formData.get("description") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const hours = normalizeLines(String(formData.get("hours") ?? ""));
  const latitudeRaw = String(formData.get("latitude") ?? "").trim();
  const longitudeRaw = String(formData.get("longitude") ?? "").trim();
  // An unchecked checkbox submits nothing at all.
  const published = formData.get("published") === "on";

  if (!name) errors.name = "Name is required";
  else if (name.length > MAX_NAME_LENGTH) {
    errors.name = `Name must be ${MAX_NAME_LENGTH} characters or fewer`;
  }

  // Required, and not only because a directory entry needs one: with no
  // coordinates given the map searches this text, so an empty address is a
  // branch with no way to be found at all.
  if (!address) errors.address = "Address is required";
  else if (address.length > MAX_ADDRESS_LENGTH) {
    errors.address = `Address must be ${MAX_ADDRESS_LENGTH} characters or fewer`;
  }

  if (description.length > MAX_DESCRIPTION_LENGTH) {
    errors.description = `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer`;
  }

  if (phone) {
    const digits = phone.replace(/\D/g, "").length;
    if (phone.length > MAX_PHONE_LENGTH) {
      errors.phone = `Phone number must be ${MAX_PHONE_LENGTH} characters or fewer`;
    } else if (!PHONE_ALLOWED.test(phone) || digits < PHONE_MIN_DIGITS) {
      errors.phone = "Enter a valid phone number";
    }
  }

  if (hours) {
    if (hours.length > MAX_HOURS_LENGTH) {
      errors.hours = `Opening hours must be ${MAX_HOURS_LENGTH} characters or fewer`;
    } else if (hours.split("\n").filter((line) => line.trim()).length > MAX_HOURS_LINES) {
      errors.hours = `Use ${MAX_HOURS_LINES} lines or fewer — one per day`;
    }
  }

  /**
   * Coordinates are a pair or nothing.
   *
   * Half a pair is not a partly-placed pin, it is a pin in the sea off Ghana —
   * and the fallback it displaces (searching the address) would have worked.
   * So the two are refused together rather than one being defaulted to zero.
   */
  const coordsGiven = Boolean(latitudeRaw) || Boolean(longitudeRaw);
  let latitude: number | null = null;
  let longitude: number | null = null;

  if (coordsGiven) {
    if (!latitudeRaw) errors.latitude = "Enter a latitude, or clear the longitude";
    if (!longitudeRaw) errors.longitude = "Enter a longitude, or clear the latitude";

    if (latitudeRaw && longitudeRaw) {
      const lat = Number(latitudeRaw);
      const lng = Number(longitudeRaw);

      // `Number("")` is 0 and `Number("12abc")` is NaN — the empty case is
      // already handled above, so this only has to catch the second.
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        errors.latitude = "Latitude must be a number between −90 and 90";
      } else latitude = lat;

      if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
        errors.longitude = "Longitude must be a number between −180 and 180";
      } else longitude = lng;
    }
  }

  // Every problem at once — reporting one at a time makes an admin submit
  // repeatedly to discover them all.
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      name,
      address,
      description: orNull(description),
      phone: orNull(phone),
      hours: orNull(hours),
      // Both or neither, so a row can never hold one half of a pin.
      latitude: longitude === null ? null : latitude,
      longitude: latitude === null ? null : longitude,
      published,
    },
  };
}

/**
 * The `tel:` target for a number stored as typed.
 *
 * Everything a dialler cannot use is dropped, and a leading `+` is kept because
 * it is the difference between an international number and a local one.
 */
export function telHref(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  return `tel:${phone.trimStart().startsWith("+") ? "+" : ""}${digits}`;
}
