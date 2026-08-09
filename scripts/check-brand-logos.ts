import {
  canSilhouette,
  resolveLogoTreatment,
  whiteVariant,
} from "../src/lib/brands/logo-format";
import { LogoTreatment } from "../src/generated/prisma/enums";

/**
 * Checks for how a hosted brand logo is treated in dark mode.
 *
 * Hosted artwork cannot take `currentColor`, so dark mode repaints it white
 * with `brightness(0) invert(1)`. That works on anything with an alpha channel
 * and fails badly on anything without one: a JPEG has no transparency, so the
 * filter whitens its background along with its logo and leaves a solid block
 * where a mark should be. This is the check that keeps the two apart.
 *
 * The extension is the only signal available before the image loads, which
 * makes it a heuristic — the point of these cases is that the *cheap* ways of
 * reading it wrong (a query string with a dot in it, an uppercase extension)
 * are covered.
 *
 *   npm run check:brand-logos
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

function equal(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  check(label, a === b, a === b ? "" : `expected ${b}, got ${a}`);
}

console.log("\nArtwork with transparency is repainted white");

for (const url of [
  "https://cdn.brandfetch.io/idrZPiD0VJ/theme/dark/logo.svg?c=abc",
  "https://cdn.brandfetch.io/id42uuUv4E/w/300/h/83/theme/dark/logo.png?c=abc",
  "https://cdn.brandfetch.io/idZx11xCTE/theme/dark/idEPzHEXKA.svg?c=abc",
  "/uploads/acme.png",
  "https://example.com/logo.webp",
  "https://example.com/logo.SVG",
]) {
  check(`silhouetted: ${url.slice(0, 52)}`, canSilhouette(url), "expected true");
}

console.log("\nArtwork without transparency keeps its colours and gets a plate");

for (const url of [
  "https://cdn.brandfetch.io/idRUAwD966/w/400/h/400/theme/dark/icon.jpeg?c=abc",
  "https://example.com/logo.jpg",
  "/uploads/mark.JPG",
  "https://example.com/logo.jpeg?width=400",
]) {
  check(`plated: ${url.slice(0, 52)}`, !canSilhouette(url), "expected false");
}

console.log("\nThe query string is not mistaken for the extension");

check(
  "a token ending in .jpg does not condemn an svg",
  canSilhouette("https://cdn.example.com/logo.svg?c=deadbeef.jpg"),
  "the extension must be read from the path, not the whole url",
);
check(
  "a fragment is ignored too",
  canSilhouette("https://cdn.example.com/logo.png#v2.jpg"),
);
check(
  "a jpeg is still a jpeg with a query after it",
  !canSilhouette("https://cdn.example.com/icon.jpeg?c=abc&w=400"),
);

console.log("\nThe white variant is the /theme/light/ file, never the other way");

const STORED = "https://cdn.brandfetch.io/idLsXYVLUs/theme/dark/logo.svg?c=abc";
const WHITE = "https://cdn.brandfetch.io/idLsXYVLUs/theme/light/logo.svg?c=abc";

check(
  "a stored /theme/dark/ url yields the /theme/light/ file",
  whiteVariant(STORED) === WHITE,
  `got ${whiteVariant(STORED)}`,
);
check(
  "a url already on /theme/light/ is its own white variant",
  whiteVariant(WHITE) === WHITE,
  `got ${whiteVariant(WHITE)}`,
);
check(
  "swapping never touches the rest of the url",
  whiteVariant("https://cdn.brandfetch.io/x/w/300/h/83/theme/dark/logo.png?c=a&v=2") ===
    "https://cdn.brandfetch.io/x/w/300/h/83/theme/light/logo.png?c=a&v=2",
);
for (const url of ["/uploads/acme.png", "https://example.com/darkroom/logo.svg"]) {
  check(`no variant to derive: ${url.slice(0, 44)}`, whiteVariant(url) === null);
}

console.log("\nEach setting resolves to the treatment it names");

const SVG = "https://cdn.brandfetch.io/x/theme/dark/logo.svg?c=abc";
const JPEG = "https://cdn.brandfetch.io/x/theme/dark/icon.jpeg?c=abc";
const PLAIN = "/uploads/acme.png";

equal("INVERT is honoured", resolveLogoTreatment(LogoTreatment.INVERT, SVG), "invert");
equal("PLATE is honoured", resolveLogoTreatment(LogoTreatment.PLATE, SVG), "plate");
equal("NONE is honoured", resolveLogoTreatment(LogoTreatment.NONE, SVG), "none");
equal("VARIANT is honoured", resolveLogoTreatment(LogoTreatment.VARIANT, SVG), "variant");
check(
  "VARIANT falls back when there is no counterpart to load",
  resolveLogoTreatment(LogoTreatment.VARIANT, PLAIN) === "none",
  "pointing an <img> at a guessed URL is worse than doing nothing",
);
equal("AUTO silhouettes transparent artwork", resolveLogoTreatment(LogoTreatment.AUTO, SVG), "invert");
equal("AUTO plates opaque artwork", resolveLogoTreatment(LogoTreatment.AUTO, JPEG), "plate");
equal("an absent setting behaves as AUTO", resolveLogoTreatment(null, SVG), "invert");
equal("an undefined setting behaves as AUTO", resolveLogoTreatment(undefined, JPEG), "plate");

console.log(
  failures === 0
    ? "\nAll brand logo checks passed.\n"
    : `\n${failures} check(s) failed.\n`,
);
process.exitCode = failures === 0 ? 0 : 1;
