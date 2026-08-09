"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/dal";
import { parseStoreSettings } from "@/lib/settings/validation";
import { SETTINGS_ID } from "@/lib/settings/service";

export type StoreSettingsFormState = {
  errors?: Record<string, string>;
  message?: string;
  success?: string;
};

export async function updateStoreSettings(
  _prev: StoreSettingsFormState,
  formData: FormData,
): Promise<StoreSettingsFormState> {
  // Every mutation re-checks the role against the database, not the JWT.
  await requireAdmin();

  const parsed = parseStoreSettings(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  /**
   * Upsert, because the row may not exist yet.
   *
   * The fixed id is what makes this safe to call concurrently: two admins
   * saving at once contend on one primary key rather than racing to create two
   * "settings" rows, one of which would then be ignored forever.
   */
  await prisma.storeSettings.upsert({
    where: { id: SETTINGS_ID },
    update: parsed.data,
    create: { id: SETTINGS_ID, ...parsed.data },
  });

  /**
   * The support buttons read these on render, and they are in the footer —
   * which is on every storefront page. So the whole tree is revalidated rather
   * than a list of routes that would drift the moment a button is added
   * somewhere new.
   */
  revalidatePath("/", "layout");

  return { success: "Saved." };
}
