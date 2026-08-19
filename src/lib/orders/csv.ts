import { orderReference } from "@/lib/orders/reference";
import { SHOP_CURRENCY } from "@/lib/money/currency";
import type { AdminOrderRecord } from "@/lib/orders/row-view";

/**
 * The order list as a spreadsheet.
 *
 * Values, not presentation: the amount is a bare number in major units and the
 * date is ISO 8601, because the first thing anyone does with this file is sum a
 * column or sort by date, and "Rs 1,234" is a string that does neither. The
 * currency gets its own column so the number is still unambiguous.
 */

const COLUMNS = [
  "Reference",
  "Order ID",
  "Placed",
  "Status",
  "Customer",
  "Email",
  "City",
  "Country",
  "Fulfilment",
  "Payment",
  "Items",
  "Amount",
  "Currency",
] as const;

/**
 * Quote a field for RFC 4180, and defuse it for Excel.
 *
 * The escaping half is ordinary: wrap anything containing a comma, a quote or a
 * newline, and double the quotes inside.
 *
 * The other half is the important one. A cell beginning `=`, `+`, `-`, `@` or a
 * lone tab is a *formula* to Excel, Sheets and LibreOffice — and several of
 * these columns are filled in by customers at checkout. A shopper who names
 * themselves `=HYPERLINK(...)` is writing code that runs when an admin opens
 * the export. Prefixing a single quote makes the spreadsheet treat it as text;
 * the quote is not part of the value and does not show in the cell.
 */
export function csvCell(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;

  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export const csvRow = (values: (string | number | null)[]) => values.map(csvCell).join(",");
const row = csvRow;

export function ordersToCsv(orders: AdminOrderRecord[]): string {
  const lines = [
    row([...COLUMNS]),
    ...orders.map((order) =>
      row([
        orderReference(order.id),
        order.id,
        order.createdAt.toISOString(),
        order.status,
        order.shippingName ?? order.user.name ?? "",
        order.user.email,
        order.shippingCity ?? "",
        order.shippingCountry ?? "",
        order.fulfilment,
        order.paymentMethod,
        order._count.items,
        (order.totalCents / SHOP_CURRENCY.minorUnits).toFixed(2),
        SHOP_CURRENCY.code,
      ]),
    ),
  ];

  // CRLF per RFC 4180, and a trailing one so the last row is terminated.
  return `${lines.join("\r\n")}\r\n`;
}

/**
 * A filename that says what the file contains.
 *
 * Downloads folders accumulate; `orders.csv` overwritten four times tells you
 * nothing about which filter produced which. The status and the date are worth
 * the longer name.
 */
export function csvFilename(status: string | undefined, stamp: Date): string {
  const day = stamp.toISOString().slice(0, 10);
  return `orders-${status ? status.toLowerCase() : "all"}-${day}.csv`;
}
