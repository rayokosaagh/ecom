/**
 * A brand's initials, for the rails where a brand has no mark to show.
 *
 * Two letters from a two-word name ("Peak Design" → PD), otherwise the first
 * two characters of the single word ("Anker" → AN). The point is that each
 * fallback is *distinct*: a shared placeholder glyph repeated down a rail reads
 * as a row of broken images, where initials read as a brand.
 *
 * Lives here rather than in either rail because both of them need it, and a
 * brand that shows "PD" on the home page must not show "PE" on the catalogue.
 */
export function brandInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length > 1) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}
