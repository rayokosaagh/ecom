import {
  TINTS,
  DEFAULT_TINT_ID,
  isTintId,
  isTintValue,
  isHexColor,
  tintById,
  resolveWellTint,
  resolveWell,
} from "@/lib/tints";

/**
 * The tint palette's contract, checked rather than assumed.
 *
 * Three things have to hold for the admin picker and the storefront to agree,
 * and all three are the kind that break silently:
 *
 *  - every preset must produce a non-empty swatch, or the picker shows an
 *    invisible chip that cannot be chosen on purpose;
 *  - an unknown or retired id must degrade to the automatic cycle rather than
 *    to a blank background or a crash — this is the whole reason the column is
 *    text and not an enum;
 *  - the automatic cycle must give adjacent positions different washes, which
 *    is the property that made it worth cycling by index instead of hashing.
 */
let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    console.log(`  ok    ${label}`);
  } else {
    failures++;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log(`Palette (${TINTS.length} presets)`);
for (const tint of TINTS) {
  check(`${tint.id} has a label`, tint.label.trim().length > 0);
  check(`${tint.id} has a swatch`, tint.swatch.trim().length > 0);
}

console.log("\nNeutral is the default and paints nothing");
check("default id resolves", isTintId(DEFAULT_TINT_ID));
check("neutral well is empty", tintById(DEFAULT_TINT_ID).well === "");

console.log("\nChosen ids win over the cycle");
for (const tint of TINTS) {
  check(
    `${tint.id} at any index returns its own well`,
    resolveWellTint(tint.id, 0) === tint.well &&
      resolveWellTint(tint.id, 7) === tint.well,
  );
}

console.log("\nUnknown ids fall back rather than blanking");
for (const bad of ["", "crimson", "DROP TABLE", "bg-red-500"]) {
  check(
    `"${bad}" degrades to the cycle`,
    resolveWellTint(bad, 1) === resolveWellTint(null, 1),
  );
}

console.log("\nThe automatic cycle never repeats a neighbour");
for (let i = 0; i < 8; i++) {
  check(
    `position ${i} differs from ${i + 1}`,
    resolveWellTint(null, i) !== resolveWellTint(null, i + 1),
    `${resolveWellTint(null, i)} === ${resolveWellTint(null, i + 1)}`,
  );
}

console.log("\nCustom colours are accepted in the one form the picker emits");
for (const good of ["#0b57d0", "#FFFFFF", "#00ff00", "#AbCdEf"]) {
  check(`${good} is a colour`, isHexColor(good) && isTintValue(good));
  const paint = resolveWell(good, 0);
  check(
    `${good} paints as a style, not a class`,
    paint.className === "" && (paint.style?.backgroundImage ?? "").includes(good),
  );
}

/*
 * The important half. This value reaches a `style` attribute, so anything that
 * is not exactly `#rrggbb` has to be refused *before* it gets there — a stored
 * value carrying a `;` or a `url(` would otherwise be a way to add declarations
 * to a page from the admin form. Every one of these must fall back instead.
 */
console.log("\nAnything else is refused and falls back");
const hostile = [
  "#abc", // short form the picker never emits
  "#12345g", // not hex
  "#0b57d0;background:url(x)", // declaration injection
  "red",
  "rgb(0,0,0)",
  "url(javascript:alert(1))",
  "#0b57d0 </style>",
  "expression(alert(1))",
];
for (const bad of hostile) {
  check(`"${bad}" is not a colour`, !isHexColor(bad) && !isTintValue(bad));
  const paint = resolveWell(bad, 1);
  check(
    `"${bad}" paints no inline style at all`,
    paint.style === undefined && paint.className === resolveWellTint(null, 1),
  );
}

console.log(
  failures === 0 ? "\nAll tint checks passed." : `\n${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
