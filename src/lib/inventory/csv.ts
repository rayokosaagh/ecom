import { csvRow } from "@/lib/orders/csv";
import type { StockUnit } from "@/lib/inventory/service";
import { STOCK_STATE_LABELS } from "@/lib/inventory/stock";

/**
 * The inventory as a spreadsheet: one row per line, the columns a stock take
 * or a reorder is done from. Prices in major units, because that is what a
 * person reads; minor units would be right for a machine and wrong for the
 * only reader this file has.
 */
const COLUMNS = [
  "Product",
  "Configuration",
  "SKU",
  "Category",
  "Brand",
  "Published",
  "Stock",
  "State",
  "Low at",
  "Reorder note",
  "Price",
  "Regular price",
] as const;

export function inventoryToCsv(units: StockUnit[], minorUnits: number): string {
  const money = (cents: number | null) => (cents === null ? "" : String(cents / minorUnits));
  const lines = [
    csvRow([...COLUMNS]),
    ...units.map((unit) =>
      csvRow([
        unit.name,
        unit.configuration ?? "",
        unit.sku ?? "",
        unit.category ?? "",
        unit.brand ?? "",
        unit.published ? "yes" : "no",
        unit.stock,
        STOCK_STATE_LABELS[unit.state],
        unit.threshold,
        unit.reorderNote ?? "",
        money(unit.priceCents),
        money(unit.compareAtPriceCents),
      ]),
    ),
  ];
  return lines.join("\r\n");
}

export function inventoryCsvFilename(stamp: Date): string {
  return `inventory-${stamp.toISOString().slice(0, 10)}.csv`;
}
