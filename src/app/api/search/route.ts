import type { NextRequest } from "next/server";

import { searchProductSuggestions } from "@/lib/products/search";
import { MAX_QUERY_LENGTH, type SearchResponse } from "@/lib/products/search-text";

/**
 * Typeahead endpoint for the search bars.
 *
 * A Route Handler rather than a Server Action: Next.js dispatches actions one
 * at a time per client, so a keystroke-rate action would queue behind whatever
 * mutation is in flight. Reads have no such constraint here.
 *
 * Uncached by design — results depend on the live catalogue, and the response
 * is small enough that a round trip per (debounced) keystroke is cheap.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("q") ?? "";
  const query = raw.slice(0, MAX_QUERY_LENGTH).trim();

  if (!query) {
    return Response.json({ query: "", results: [] } satisfies SearchResponse);
  }

  const limit = Number(request.nextUrl.searchParams.get("limit")) || 6;
  const results = await searchProductSuggestions(query, limit);

  return Response.json({ query, results } satisfies SearchResponse);
}
