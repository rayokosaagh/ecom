import type { Validated } from "@/lib/auth/validation";
import { normalizeWhatsappNumber } from "@/lib/whatsapp/link";

/**
 * Admin form rules for the store settings.
 *
 * Free of `server-only` and of any database access, like every other `parse*`
 * here — `npm run check:settings` exercises it directly.
 */

/** Long enough for "Mon–Fri, 9am–6pm · replies within the hour". */
export const MAX_NOTE_LENGTH = 120;

/** A few lines of address — a street, a landmark, a town. Not an essay. */
export const MAX_PICKUP_ADDRESS_LENGTH = 300;

export type StoreSettingsInput = {
  /** As typed, not normalized — see the note below. */
  whatsappNumber: string | null;
  whatsappEnabled: boolean;
  whatsappNote: string | null;
  pickupEnabled: boolean;
  pickupAddress: string | null;
  pickupHours: string | null;
  pickupNote: string | null;
  homeHeroCombined: boolean;
};

export function parseStoreSettings(
  formData: FormData,
): Validated<StoreSettingsInput> {
  const errors: Record<string, string> = {};

  const whatsappNumber = String(formData.get("whatsappNumber") ?? "").trim();
  const whatsappNote = String(formData.get("whatsappNote") ?? "").trim();
  // An unchecked checkbox submits nothing at all.
  const whatsappEnabled = formData.get("whatsappEnabled") === "on";

  const pickupEnabled = formData.get("pickupEnabled") === "on";
  const pickupAddress = String(formData.get("pickupAddress") ?? "").trim();
  const pickupHours = String(formData.get("pickupHours") ?? "").trim();
  const pickupNote = String(formData.get("pickupNote") ?? "").trim();

  /**
   * Which home page arrangement to serve. Nothing to validate — it is one
   * checkbox with two legal states, and both of them render a whole page.
   */
  const homeHeroCombined = formData.get("homeHeroCombined") === "on";

  /**
   * Switching collection on without saying where is refused.
   *
   * The storefront already guards this — `pickupAvailable` needs both — so
   * saving it would not break anything; it would just do nothing, silently,
   * and leave an admin looking at a checked box wondering why no option
   * appeared. The refusal is what turns that into an answer.
   */
  if (pickupEnabled && !pickupAddress) {
    errors.pickupAddress =
      "Add the address to collect from — collection cannot be offered without one";
  }

  if (pickupAddress.length > MAX_PICKUP_ADDRESS_LENGTH) {
    errors.pickupAddress = `Keep this under ${MAX_PICKUP_ADDRESS_LENGTH} characters`;
  }

  if (pickupHours.length > MAX_NOTE_LENGTH) {
    errors.pickupHours = `Keep this under ${MAX_NOTE_LENGTH} characters`;
  }

  if (pickupNote.length > MAX_NOTE_LENGTH) {
    errors.pickupNote = `Keep this under ${MAX_NOTE_LENGTH} characters`;
  }

  /**
   * Validated by the same function that builds the link.
   *
   * The rule that matters: if `normalizeWhatsappNumber` cannot make sense of
   * it, the button would silently render nothing — so the form rejects it here
   * instead, where there is somebody to tell. One definition of "usable",
   * used by both the check and the link.
   */
  if (whatsappNumber && normalizeWhatsappNumber(whatsappNumber) === null) {
    errors.whatsappNumber =
      "That does not look like an international number. Include the country code, e.g. +44 7911 123456";
  }

  if (whatsappNote.length > MAX_NOTE_LENGTH) {
    errors.whatsappNote = `Keep this under ${MAX_NOTE_LENGTH} characters`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      /**
       * Stored as typed rather than normalized.
       *
       * An admin who enters "+44 7911 123456" should see that back, not
       * "447911123456" — the stored value is what a person reads and edits,
       * and stripping it to digits makes the field look like it mangled their
       * input. Normalizing is the link builder's job, at the point of use.
       */
      whatsappNumber: whatsappNumber || null,
      whatsappEnabled,
      whatsappNote: whatsappNote || null,
      pickupEnabled,
      // Kept rather than cleared when collection is switched off, the same way
      // the WhatsApp number survives the toggle: taking the counter down for a
      // refit should not mean retyping the address to put it back.
      pickupAddress: pickupAddress || null,
      pickupHours: pickupHours || null,
      pickupNote: pickupNote || null,
      homeHeroCombined,
    },
  };
}
