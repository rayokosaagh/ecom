import type { MaterialSymbol } from "material-symbols";

/**
 * A glyph for a category, worked out from its name.
 *
 * Derived rather than stored, and that is a decision about where categories
 * come from rather than a shortcut. There is no category editor in this app:
 * they are created by typing a name into the product form or the banner form
 * (`newCategoryName`), which means a `Category.icon` column would have no
 * screen to be filled in on. It would sit null for every category anyone
 * created and the menu would be back to no icons — the very thing this is for.
 *
 * A name is the one thing every category is guaranteed to have, and it is
 * chosen by a human describing the shelf, so it carries the information needed
 * to pick a picture. "Gaming Laptops" arrives already saying what it is.
 *
 * The typed `MaterialSymbol` return is load-bearing: an invented ligature name
 * does not fail, it renders the raw text "laptop_mac" in the middle of the
 * menu. Here a typo is a build error instead.
 */

/**
 * Ordered, and the order is the whole design.
 *
 * Matching is first-hit, most specific first, so a name that could take two
 * icons gets the one that says more. "Gaming Laptops" hits `gaming` before it
 * reaches `laptop`, which is right: it sits in a list under "Laptops" beside
 * "Workstations" and "Student Laptops", where a fourth laptop glyph would tell
 * a reader nothing and a gamepad tells them everything. The same reasoning puts
 * `floor lamp` and `desk lamp` above the general `lamp`.
 *
 * Patterns are matched against the lowercased name, so they are written
 * lowercase and unanchored — "Bags", "Laptop Bags" and "Bags & Cases" all hit
 * the same rule.
 */
const RULES: Array<[RegExp, MaterialSymbol]> = [
  // --- Audio ---------------------------------------------------------------
  [/headphone|over.?ear|on.?ear/, "headphones"],
  [/earbud|earphone|in.?ear|airpod/, "earbuds"],
  [/speaker|soundbar|subwoofer/, "speaker"],
  [/microphone|\bmic\b/, "mic"],
  [/audio|sound|music|hi.?fi/, "graphic_eq"],

  // --- Computing -----------------------------------------------------------
  // Ahead of `laptop` and `desktop` on purpose: what makes a gaming machine or
  // a student machine worth its own shelf is not that it is a computer.
  [/gaming|esport|\bgamer/, "sports_esports"],
  [/student|school|education/, "school"],
  [/workstation|desktop|\bpc\b|tower/, "desktop_windows"],
  [/ultrabook|laptop|notebook|macbook/, "laptop_mac"],
  [/tablet|ipad/, "tablet"],
  [/phone|mobile|handset/, "devices"],

  // --- Peripherals ---------------------------------------------------------
  [/keyboard/, "keyboard"],
  [/mouse|mice|trackpad/, "mouse"],
  [/monitor|display|screen/, "monitor"],
  [/webcam|camera/, "photo_camera"],
  [/printer|printing|scanner/, "print"],
  [/storage|\bssd\b|\bhdd\b|drive|memory|\bram\b/, "memory"],
  [/router|network|wi.?fi|ethernet/, "router"],
  [/peripheral|input device/, "devices_other"],

  // --- Power and carry -----------------------------------------------------
  [/charger|charging|power bank|battery|adapter|\bpower\b/, "power"],
  [/cable|cord|\busb\b|dock/, "cable"],
  [/\bbag|backpack|case|sleeve|pack\b|luggage/, "backpack"],
  [/watch|wearable|band\b/, "watch"],
  [/clothing|apparel|wear\b|shirt/, "checkroom"],

  // --- Lighting ------------------------------------------------------------
  // Both above the general `lamp` rule, and both a real distinction: a floor
  // lamp and a desk lamp are the two things a lighting shelf splits into.
  [/floor lamp|standing lamp/, "floor_lamp"],
  [/desk lamp|table lamp|reading lamp/, "table_lamp"],
  [/light|lamp|lumen|bulb|pendant|chandelier/, "lightbulb"],

  // --- Everything else a shop might grow into ------------------------------
  [/furniture|chair|\bdesk\b|table\b/, "chair"],
  [/kitchen|appliance|cookware/, "kitchen"],
  [/\btoy|\bgame|puzzle/, "toys"],
  [/book|reading|stationery/, "book_2"],
  [/sport|fitness|\bgym\b|outdoor/, "fitness_center"],
  [/art|design|creative|paint/, "palette"],
  // Last, because "accessories" is what a shop calls the shelf for things that
  // did not fit any of the above — so it should only win once they have all
  // been tried. "Laptop Accessories" is a laptop shelf; bare "Accessories" is
  // not anything more specific.
  [/accessor|add.?on|extra/, "widgets"],
];

/** What an unrecognised shelf gets: a label, which is what a category is. */
const FALLBACK: MaterialSymbol = "sell";

export function categoryIcon(name: string): MaterialSymbol {
  const haystack = name.toLowerCase();

  for (const [pattern, icon] of RULES) {
    if (pattern.test(haystack)) return icon;
  }

  return FALLBACK;
}
