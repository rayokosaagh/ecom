/**
 * Which of a product's specs are worth annotating its photograph with.
 *
 * The hero draws three or four callouts around the featured product, each
 * pointing at it with a short line. This module decides *which* specs those
 * are and hands back a flat, presentation-ready list; the components that draw
 * them hold no product knowledge at all and no spec values of their own.
 *
 * Free of `server-only` and of any database access, like the other `lib/products`
 * helpers — it is a pure function over what `getFeaturedProducts` already
 * returned, so it can be exercised directly and runs on either side.
 *
 * ## Everything here is keyed, nothing is written
 *
 * Not one spec *value* appears in this file. The catalogue's own
 * `SpecDefinition` rows supply the label, the value, the unit and the icon; all
 * this adds is an opinion about ordering, expressed as a list of **keys**.
 * `key` is the right handle for that: it is a unique slug on the definition,
 * where `label` is display text an admin can rename at any time — renaming
 * "RAM (GB)" to "Memory" must not quietly drop it out of the hero.
 *
 * ## Why a priority list rather than the existing order
 *
 * `SpecDefinition.sortOrder` is a good *reading* order for a table — it is why
 * RAM sits above Weight on every laptop — but it is not a ranking of what
 * earns a callout. Taken in order, a laptop's first three are Processor, GPU
 * and CPU cores, which spends a callout on core count while RAM, storage and a
 * 240Hz panel go unmentioned. So the pool is scanned for the keys below in
 * turn, and anything the product does not carry is simply skipped.
 *
 * A product with none of these keys — a backpack, a desk lamp — still gets
 * callouts: the fallback is the catalogue's own order, so the annotation is
 * "Capacity 20 L" rather than nothing. What never happens is an empty callout;
 * a spec that is not there produces no card.
 */

/** One spec as `getFeaturedProducts` returns it. */
export type SpecInput = {
  key: string;
  label: string;
  value: string;
  icon: string | null;
};

/** Where a callout sits relative to the product. */
export type CalloutPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type SpecCallout = {
  /** The definition's slug — also the React key. */
  key: string;
  /** Uppercase category line, e.g. "PROCESSOR". From the definition's label. */
  label: string;
  /** The headline value, e.g. "Apple M1". Carries its unit already. */
  value: string;
  /** A related spec, when the product has one. Null when it does not. */
  secondary: { label: string; value: string } | null;
  /** Material Symbols ligature from the definition, or a neutral fallback. */
  icon: string;
  position: CalloutPosition;
};

/**
 * The specs worth pointing at, best first.
 *
 * Every key here is a real `SpecDefinition.key` in this catalogue. A key that
 * is added to the taxonomy later and is missing from this list is not lost —
 * it simply falls to the tail order below rather than being promoted.
 */
const PRIORITY: readonly string[] = [
  // What the machine is
  "processor",
  "gpu",
  "ram",
  "storage",
  // What you look at
  "refresh-rate",
  "resolution",
  "screen-size",
  "panel-type",
  // What it runs on
  "battery-life",
  "battery-capacity",
  // The rest of the catalogue: audio, bags, lighting, peripherals
  "noise-cancelling",
  "capacity",
  "brightness",
  "driver-size",
  "switch-type",
  "weather-resistance",
  "connection",
  "ports",
];

/**
 * The spec that elaborates another, when the product has both.
 *
 * This is what fills the callout's optional second line: "Apple M1" is more
 * useful with "CPU cores 8" under it. Pairings only — the value still comes
 * from the product's own row, and a product missing the partner simply gets a
 * one-line callout.
 */
const SECONDARY_OF: Readonly<Record<string, string>> = {
  processor: "cpu-cores",
  gpu: "graphics-memory",
  ram: "storage",
  storage: "ram",
  "screen-size": "resolution",
  resolution: "panel-type",
  "refresh-rate": "panel-type",
  "battery-capacity": "battery-life",
  "battery-life": "battery-capacity",
  "noise-cancelling": "wearing-style",
  connection: "ports",
};

/**
 * Clockwise-ish, so three callouts still read as surrounding the product
 * rather than stacking down one side.
 */
const POSITIONS: readonly CalloutPosition[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

/** Shown when a definition has no icon of its own — never a hole. */
const FALLBACK_ICON = "label";

/** The most callouts a product gets, however many specs it carries. */
export const MAX_CALLOUTS = POSITIONS.length;

/**
 * Choose the callouts for one product.
 *
 * Returns between zero and `MAX_CALLOUTS` entries. Zero is a real answer — a
 * product with no specs recorded gets no annotation layer at all, which is the
 * intended behaviour rather than a row of blank cards.
 */
export function buildSpecCallouts(
  specs: readonly SpecInput[],
  max: number = MAX_CALLOUTS,
): SpecCallout[] {
  if (specs.length === 0) return [];

  const byKey = new Map(specs.map((spec) => [spec.key, spec]));

  // Priority first, then whatever else the product carries in catalogue order.
  // `Set` rather than an array scan so a long spec list stays cheap, and so a
  // key listed twice cannot produce the same callout twice.
  const ordered: SpecInput[] = [];
  const taken = new Set<string>();

  for (const key of PRIORITY) {
    const spec = byKey.get(key);
    if (spec && !taken.has(key)) {
      ordered.push(spec);
      taken.add(key);
    }
  }
  for (const spec of specs) {
    if (!taken.has(spec.key)) {
      ordered.push(spec);
      taken.add(spec.key);
    }
  }

  const chosen = ordered.slice(0, Math.min(max, POSITIONS.length));

  // A spec already shown as a callout of its own is not repeated underneath
  // another one — "Storage 1024 GB" beneath the RAM callout while Storage has
  // its own card is the same fact twice, in a layout with no room for it.
  //
  // The same set then absorbs each partner as it is used, which stops one spec
  // being borrowed by two cards. Two keys can point at the same partner —
  // Refresh rate and Resolution both elaborate with Panel type — and on a
  // product carrying all three that read as "Panel type: IPS" twice, one card
  // above the other.
  const shown = new Set(chosen.map((spec) => spec.key));

  return chosen.map((spec, index) => {
    const partnerKey = SECONDARY_OF[spec.key];
    const partner =
      partnerKey && !shown.has(partnerKey) ? byKey.get(partnerKey) : undefined;
    if (partner) shown.add(partner.key);

    return {
      key: spec.key,
      label: spec.label,
      value: spec.value,
      secondary: partner ? { label: partner.label, value: partner.value } : null,
      icon: spec.icon ?? FALLBACK_ICON,
      position: POSITIONS[index],
    };
  });
}
