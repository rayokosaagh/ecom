/**
 * How a code is written down.
 *
 * Its own module, free of `server-only`, because both the server action and
 * the admin form need it — and `lib/discounts/service` cannot be imported from
 * anything that might render on the client.
 */

/**
 * Codes are stored uppercased, so "save10" and "SAVE10" are the same code and
 * matching is an exact lookup rather than a case-insensitive scan.
 */
export function normalizeCode(input: string): string {
  return input.trim().toUpperCase();
}
