import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/prisma";

/**
 * The shop's own configuration.
 *
 * One row, always. `StoreSettings` is keyed by a fixed id so reading it is a
 * single indexed lookup and writing it is an upsert — there is never a question
 * of which row is the real one, and no migration is needed to create it.
 */

/** The only id this table ever holds. See the model's own note. */
export const SETTINGS_ID = "singleton";

export interface StoreSettingsView {
  whatsappNumber: string;
  whatsappEnabled: boolean;
  whatsappNote: string;
  pickupEnabled: boolean;
  pickupAddress: string;
  pickupHours: string;
  pickupNote: string;
}

/** The columns both readers below ask for. */
const SETTINGS_SELECT = {
  whatsappNumber: true,
  whatsappEnabled: true,
  whatsappNote: true,
  pickupEnabled: true,
  pickupAddress: true,
  pickupHours: true,
  pickupNote: true,
} as const;

/**
 * Read the settings, falling back to the environment.
 *
 * Precedence is deliberate and one-directional: a value saved in the admin
 * screen wins, and `WHATSAPP_NUMBER` is consulted only when that is empty. A
 * deployment configured through the environment before this screen existed
 * therefore keeps working untouched, and the moment someone types a number into
 * the form it takes over — with no migration step and nothing to remember.
 *
 * `cache` so several components on one page — the product button, the footer,
 * the home hero — share a single query rather than each making their own.
 */
export const getStoreSettings = cache(async (): Promise<StoreSettingsView> => {
  const row = await prisma.storeSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: SETTINGS_SELECT,
  });

  const number = row?.whatsappNumber?.trim() || process.env.WHATSAPP_NUMBER?.trim() || "";

  return {
    whatsappNumber: number,
    // Defaults to on: a shop that has entered a number has said what it wants,
    // and a missing row should not silently hide the buttons.
    whatsappEnabled: row?.whatsappEnabled ?? true,
    whatsappNote: row?.whatsappNote?.trim() ?? "",
    // Defaults to *off*, unlike WhatsApp above, and the asymmetry is the point:
    // a missing number hides a button, while a missing counter sends somebody
    // to a shop that is not there. `pickupAvailable` requires the address too.
    pickupEnabled: row?.pickupEnabled ?? false,
    pickupAddress: row?.pickupAddress?.trim() ?? "",
    pickupHours: row?.pickupHours?.trim() ?? "",
    pickupNote: row?.pickupNote?.trim() ?? "",
  };
});

/** The stored row as the admin form needs it — no environment fallback. */
export async function getStoreSettingsForAdmin() {
  const row = await prisma.storeSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: SETTINGS_SELECT,
  });

  return {
    // Shown empty rather than pre-filled from the environment, so the form
    // never implies the database holds something it does not. The page says
    // separately when an environment value is standing in.
    whatsappNumber: row?.whatsappNumber ?? "",
    whatsappEnabled: row?.whatsappEnabled ?? true,
    whatsappNote: row?.whatsappNote ?? "",
    pickupEnabled: row?.pickupEnabled ?? false,
    pickupAddress: row?.pickupAddress ?? "",
    pickupHours: row?.pickupHours ?? "",
    pickupNote: row?.pickupNote ?? "",
  };
}

/** Whether an environment value is currently doing the work. */
export async function whatsappNumberFromEnvOnly(): Promise<string | null> {
  const row = await prisma.storeSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: { whatsappNumber: true },
  });
  if (row?.whatsappNumber?.trim()) return null;
  return process.env.WHATSAPP_NUMBER?.trim() || null;
}
