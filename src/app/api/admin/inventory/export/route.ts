import { verifiedAdmin } from "@/lib/auth/dal";
import { getInventory } from "@/lib/inventory/service";
import { inventoryCsvFilename, inventoryToCsv } from "@/lib/inventory/csv";
import type { StockState } from "@/lib/inventory/stock";
import { SHOP_CURRENCY } from "@/lib/money/currency";

/**
 * The inventory list as a CSV download — the list you are looking at.
 *
 * A route handler rather than a server action for the reason the orders
 * export is: the result is a file, and a link to a URL gets the browser's own
 * download. The filters arrive as the same query params the page reads, so a
 * filtered screen exports the filtered list and never silently the whole
 * catalogue.
 */

/** Most lines one download may contain; `X-Export-Truncated` says when it bit. */
const MAX_EXPORT_ROWS = 10_000;

function asState(value: string | null): StockState | undefined {
  return value === "OUT" || value === "LOW" || value === "IN" ? value : undefined;
}

export async function GET(request: Request) {
  const admin = await verifiedAdmin();
  if (!admin) return new Response("Not authorised", { status: 403 });

  const params = new URL(request.url).searchParams;
  const inventory = await getInventory({
    query: params.get("q") ?? undefined,
    category: params.get("category") ?? undefined,
    brand: params.get("brand") ?? undefined,
    state: asState(params.get("state")),
    pageSize: MAX_EXPORT_ROWS,
  });

  const body = inventoryToCsv(inventory.units, SHOP_CURRENCY.minorUnits);
  const truncated = inventory.totalPages > 1;

  return new Response(`﻿${body}`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${inventoryCsvFilename(new Date())}"`,
      "Cache-Control": "no-store",
      "X-Export-Rows": String(inventory.units.length),
      ...(truncated ? { "X-Export-Truncated": "true" } : {}),
    },
  });
}
