import { parseVariants } from "../src/lib/products/variant-parse";
import {
  planVariantSync,
  variantSignature,
  type ExistingVariant,
  type VariantRow,
} from "../src/lib/products/variant-sync";

/**
 * Checks for how saving the product form treats variants.
 *
 * A variant's id is what its stock ledger, its price ledger and every order
 * line that took units from it point at. Saving the form used to delete and
 * recreate every variant, which cascaded both ledgers away on each edit and
 * left cancelled orders restocking an id that no longer existed. What is
 * defended here is that a stored variant the form still lists keeps its id —
 * whether matched by the id the form carried or by its configuration — and
 * that only a configuration genuinely gone is removed.
 *
 *   npm run check:variant-sync
 */

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  ok    ${label}`);
    return;
  }
  failures++;
  console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`);
}

const RAM = "def_ram";
const SSD = "def_ssd";

function row(
  id: string | null,
  values: [string, string][],
  extra: Partial<VariantRow> = {},
): VariantRow {
  return {
    id,
    sku: null,
    priceCents: 1000,
    compareAtPriceCents: null,
    stock: 0,
    sortOrder: 0,
    options: values.map(([definitionId, valueKey]) => ({
      definitionId,
      value: valueKey,
      valueKey,
    })),
    ...extra,
  };
}

const existing: ExistingVariant[] = [
  { id: "v16-512", options: [{ definitionId: RAM, valueKey: "16" }, { definitionId: SSD, valueKey: "512" }] },
  { id: "v32-1tb", options: [{ definitionId: RAM, valueKey: "32" }, { definitionId: SSD, valueKey: "1tb" }] },
];

console.log("\nWhat a configuration is");

check(
  "a signature does not depend on the order of the axes",
  variantSignature([{ definitionId: SSD, valueKey: "512" }, { definitionId: RAM, valueKey: "16" }]) ===
    variantSignature([{ definitionId: RAM, valueKey: "16" }, { definitionId: SSD, valueKey: "512" }]),
);
check(
  "a different value is a different configuration",
  variantSignature([{ definitionId: RAM, valueKey: "16" }]) !==
    variantSignature([{ definitionId: RAM, valueKey: "32" }]),
);

console.log("\nA form that lists the same configurations keeps their rows");

{
  const plan = planVariantSync(existing, [
    row("v16-512", [[RAM, "16"], [SSD, "512"]], { priceCents: 1200, sortOrder: 0 }),
    row("v32-1tb", [[RAM, "32"], [SSD, "1tb"]], { priceCents: 1800, sortOrder: 1 }),
  ]);
  check("nothing is created", plan.created.length === 0);
  check("nothing is removed", plan.removed.length === 0);
  check(
    "both rows are updated under their own ids",
    plan.updated.map((entry) => entry.id).join(",") === "v16-512,v32-1tb",
  );
  check(
    "the update carries the posted values",
    plan.updated[0]?.row.priceCents === 1200 && plan.updated[1]?.row.sortOrder === 1,
  );
}

console.log("\nThe id wins over the configuration");

{
  // The admin renamed "512" to "512gb" on the row that is v16-512. Matching by
  // configuration alone would call that a new variant and drop the old one,
  // with its ledgers; the carried id says it is the same row.
  const plan = planVariantSync(existing, [
    row("v16-512", [[RAM, "16"], [SSD, "512gb"]]),
    row("v32-1tb", [[RAM, "32"], [SSD, "1tb"]]),
  ]);
  check("a renamed value keeps the variant", plan.updated.some((entry) => entry.id === "v16-512"));
  check("and creates nothing", plan.created.length === 0 && plan.removed.length === 0);
}

console.log("\nA row without an id is still recognised by its configuration");

{
  // Removed and re-added in the same edit, or posted from a form rendered
  // before ids were carried.
  const plan = planVariantSync(existing, [
    row(null, [[RAM, "16"], [SSD, "512"]]),
    row(null, [[SSD, "1tb"], [RAM, "32"]]),
  ]);
  check(
    "both match the stored variants",
    plan.updated.map((entry) => entry.id).sort().join(",") === "v16-512,v32-1tb",
  );
  check("even with the axes in the other order", plan.updated.some((entry) => entry.id === "v32-1tb"));
  check("nothing is created or removed", plan.created.length === 0 && plan.removed.length === 0);
}

console.log("\nOnly what is genuinely new or gone changes the set of rows");

{
  const plan = planVariantSync(existing, [
    row("v16-512", [[RAM, "16"], [SSD, "512"]]),
    row(null, [[RAM, "64"], [SSD, "2tb"]], { stock: 7 }),
  ]);
  check("the kept configuration is updated", plan.updated.length === 1 && plan.updated[0].id === "v16-512");
  check("the new configuration is created", plan.created.length === 1 && plan.created[0].stock === 7);
  check("the configuration no longer listed is removed", plan.removed.join(",") === "v32-1tb");
}

{
  const plan = planVariantSync(existing, []);
  check("an empty grid removes every variant", plan.removed.length === 2 && plan.updated.length === 0);
}

{
  const plan = planVariantSync([], [row(null, [[RAM, "16"]])]);
  check("a product gaining its first variants creates them all", plan.created.length === 1);
}

console.log("\nIds the product does not own are ignored");

{
  const plan = planVariantSync(existing, [
    row("someone-elses-variant", [[RAM, "8"], [SSD, "256"]]),
  ]);
  check("a foreign id is not updated", plan.updated.length === 0);
  check("the row is treated as new", plan.created.length === 1);
  check("and the product's own variants are removed as unlisted", plan.removed.length === 2);
}

{
  // Two rows claiming the same stored variant: the second cannot also be it.
  const plan = planVariantSync(existing, [
    row("v16-512", [[RAM, "16"], [SSD, "512"]]),
    row("v16-512", [[RAM, "16"], [SSD, "1tb"]]),
  ]);
  check("a stored variant is claimed at most once", plan.updated.length === 1);
  check("the second claimant becomes a creation", plan.created.length === 1);
}

console.log("\nThe parser carries the id the form posted");

{
  const form = new FormData();
  form.append("variantAxis", "RAM");
  form.append("variantId", "v16");
  form.append("variantValue", "16 GB");
  form.append("variantPrice", "10");
  form.append("variantCompareAt", "");
  form.append("variantStock", "3");
  form.append("variantSku", "");
  form.append("variantId", "");
  form.append("variantValue", "32 GB");
  form.append("variantPrice", "12");
  form.append("variantCompareAt", "");
  form.append("variantStock", "0");
  form.append("variantSku", "");

  const parsed = parseVariants(form);
  check("the grid parses", !parsed.error && parsed.variants.length === 2, parsed.error);
  check("an existing row keeps its id", parsed.variants[0]?.id === "v16");
  check("a new row has none", parsed.variants[1]?.id === null);
}

{
  // A form without ids at all — every row is new to the parser, and the sync
  // falls back to configuration matching.
  const form = new FormData();
  form.append("variantAxis", "RAM");
  form.append("variantValue", "16 GB");
  form.append("variantPrice", "10");
  form.append("variantStock", "3");
  form.append("variantSku", "");
  const parsed = parseVariants(form);
  check("a grid posted without ids still parses", !parsed.error && parsed.variants[0]?.id === null);
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
