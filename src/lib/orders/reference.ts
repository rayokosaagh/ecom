/**
 * The short reference a customer actually quotes.
 *
 * Shared so the ticket in the list and the receipt it opens show the same
 * thing — quoting one number on one screen and a different one on the next is
 * how a support conversation goes wrong. The full id stays visible on the
 * receipt as the fine print, since that is what an admin searches by.
 */
export function orderReference(id: string): string {
  return id.replace(/-/g, "").slice(-8).toUpperCase();
}
