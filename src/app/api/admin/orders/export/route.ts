import { verifiedAdmin } from "@/lib/auth/dal";
import { csvFilename, ordersToCsv } from "@/lib/orders/csv";
import { getOrdersByIds, getOrdersForExport } from "@/lib/orders/service";
import {
  parseRangeKey,
  parseSort,
  parseStatus,
  resolveDateWindow,
} from "@/lib/orders/list-params";

/**
 * The order list as a CSV download.
 *
 * A route handler rather than a server action because the result is a *file*.
 * An action can only hand data back to the page that called it, which would
 * mean building the whole export in memory on the client and synthesising a
 * download from a blob — where a link to this URL gets the browser's own
 * download, complete with a progress indicator and a resumable connection.
 *
 * The filters arrive as the same query params the page reads, so the export is
 * the list you are looking at. Exporting everything from a filtered screen is
 * the failure mode worth designing against: it is silent, and the file looks
 * plausible either way.
 */

/**
 * The most rows one download may contain.
 *
 * High enough that no real shop hits it, low enough that a request cannot ask
 * the server to hold the entire order table in memory as a string. When it
 * bites, `X-Export-Truncated` says so — a spreadsheet quietly missing its tail
 * is worse than one that admits it.
 */
const MAX_EXPORT_ROWS = 10_000;

export async function GET(request: Request) {
  // Re-read from the database, not the JWT: this endpoint hands over every
  // customer's name, email and address in one file, so a token issued before a
  // demotion must not open it.
  const admin = await verifiedAdmin();
  if (!admin) {
    return new Response("Not authorised", { status: 403 });
  }

  const params = new URL(request.url).searchParams;

  // A selection wins over the filters: "Export selected" means those rows, and
  // re-applying the page's filters on top could silently drop some of them.
  const ids = params.getAll("id");

  const status = parseStatus(params.get("status") ?? undefined);
  const window = resolveDateWindow(
    parseRangeKey(params.get("range") ?? undefined),
    params.get("from") ?? undefined,
    params.get("to") ?? undefined,
    new Date(),
  );

  const orders =
    ids.length > 0
      ? await getOrdersByIds(ids.slice(0, MAX_EXPORT_ROWS))
      : await getOrdersForExport(
          {
            status,
            query: params.get("q") ?? undefined,
            sort: parseSort(params.get("sort") ?? undefined, status),
            window,
          },
          MAX_EXPORT_ROWS,
        );

  const body = ordersToCsv(orders);
  const truncated = orders.length === MAX_EXPORT_ROWS;

  return new Response(
    // A BOM, because Excel on Windows reads a CSV as the system codepage
    // otherwise and turns every non-ASCII name into mojibake.
    `﻿${body}`,
    {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${csvFilename(status, new Date())}"`,
        // Yesterday's export must never be served for today's request.
        "Cache-Control": "no-store",
        "X-Export-Rows": String(orders.length),
        ...(truncated ? { "X-Export-Truncated": "true" } : {}),
      },
    },
  );
}
