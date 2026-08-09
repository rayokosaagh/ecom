import { sanitizeSvg } from "../src/lib/brands/svg";

/**
 * Checks for the brand-icon sanitizer.
 *
 * The project has no test runner, and adding one for a single module is not
 * the trade this file is making. It is here because `lib/brands/svg` is a
 * security boundary — admin-supplied markup is inlined into every page that
 * shows a product — and a boundary with no executable statement of what it
 * blocks is one edit away from silently not blocking it.
 *
 *   npm run check:svg
 *
 * Relative imports rather than `@/`, matching the other scripts: these run
 * under tsx, outside the Next.js path-alias resolution.
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

console.log("\nIcons that must survive");

const simple = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2L2 22h20L12 2z" fill="#e11"/></svg>`;
const basic = sanitizeSvg(simple);
check("simple path survives", basic.ok && basic.svg.includes("M12 2L2 22h20L12 2z"));
check("fill is preserved", basic.ok && basic.svg.includes(`fill="#e11"`));

// What a real editor export looks like: no viewBox, foreign namespaces, junk.
const editorExport = `<?xml version="1.0"?>
<!-- exported -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://x" width="48" height="32">
  <metadata><rdf:RDF>junk</rdf:RDF></metadata>
  <sodipodi:namedview id="nv" pagecolor="#fff"/>
  <g inkscape:label="Layer 1" transform="translate(2,2)">
    <rect x="0" y="0" width="20" height="10" rx="2"/>
  </g>
</svg>`;
const exported = sanitizeSvg(editorExport);
check("viewBox synthesized from width/height", exported.ok && exported.svg.includes(`viewBox="0 0 48 32"`));
check("root width/height dropped", exported.ok && !/<svg[^>]*\swidth=/.test(exported.svg));
check("child width/height kept", exported.ok && exported.svg.includes(`width="20"`));
check("metadata subtree dropped", exported.ok && !exported.svg.includes("junk"));
check("unknown namespaced element dropped", exported.ok && !exported.svg.includes("namedview"));
check("unknown namespaced attribute dropped", exported.ok && !exported.svg.includes("inkscape:label"));
check("transform kept", exported.ok && exported.svg.includes(`transform="translate(2,2)"`));
check("groups are closed", exported.ok && exported.svg.includes("</g>"), exported.ok ? exported.svg : "");

console.log("\nId namespacing");

const gradient = `<svg viewBox="0 0 10 10"><defs><linearGradient id="a" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff"/></linearGradient></defs><circle cx="5" cy="5" r="4" fill="url(#a)"/></svg>`;
const painted = sanitizeSvg(gradient);
const prefix = painted.ok ? (painted.svg.match(/id="(bi[0-9a-f]{8})-a"/)?.[1] ?? "") : "";
check("ids are namespaced", Boolean(prefix), painted.ok ? painted.svg : "");
check("url(#…) references follow", painted.ok && painted.svg.includes(`fill="url(#${prefix}-a)"`));
check("case-sensitive attribute names survive", painted.ok && painted.svg.includes("gradientUnits"));

// Two icons that both call their gradient "a" must not resolve to each other's
// once they are inlined on the same product grid.
const otherGradient = sanitizeSvg(gradient.replace("#fff", "#000"));
check("distinct icons get distinct namespaces", otherGradient.ok && !otherGradient.svg.includes(`${prefix}-a`));

const second = painted.ok ? sanitizeSvg(painted.svg) : null;
const third = second?.ok ? sanitizeSvg(second.svg) : null;
check(
  "re-saving does not stack prefixes",
  Boolean(second?.ok && !/bi[0-9a-f]{8}-bi[0-9a-f]{8}/.test(second.svg)),
  second?.ok ? second.svg : "",
);
check("stable from the second pass on", Boolean(second?.ok && third?.ok && second.svg === third.svg));

console.log("\nHostile markup that must not survive");

const attacks: [string, string][] = [
  ["inline script", `<svg viewBox="0 0 1 1"><rect width="1" height="1"/><script>alert(1)</script></svg>`],
  ["event handler", `<svg viewBox="0 0 1 1"><rect width="1" height="1" onload="alert(1)"/></svg>`],
  ["event handler on root", `<svg viewBox="0 0 1 1" onload="alert(1)"><rect width="1" height="1"/></svg>`],
  ["foreignObject smuggling html", `<svg viewBox="0 0 1 1"><rect width="1" height="1"/><foreignObject><img src=x onerror="alert(1)"></foreignObject></svg>`],
  ["javascript: anchor", `<svg viewBox="0 0 1 1"><a href="javascript:alert(1)"><rect width="1" height="1"/></a></svg>`],
  ["external image", `<svg viewBox="0 0 1 1"><rect width="1" height="1"/><image href="http://evil.example/x.png"/></svg>`],
  ["style element with @import", `<svg viewBox="0 0 1 1"><style>@import url(http://evil.example/x.css)</style><rect width="1" height="1"/></svg>`],
  ["style attribute", `<svg viewBox="0 0 1 1"><rect width="1" height="1" style="background:url(http://evil.example/x)"/></svg>`],
  ["off-origin paint reference", `<svg viewBox="0 0 1 1"><rect width="1" height="1" fill="url(http://evil.example/x#a)"/></svg>`],
  ["entity-encoded url()", `<svg viewBox="0 0 1 1"><rect width="1" height="1" fill="&#117;rl(http://evil.example/x)"/></svg>`],
  ["animate retargeting href", `<svg viewBox="0 0 1 1"><rect width="1" height="1"><animate attributeName="href" values="javascript:alert(1)"/></rect></svg>`],
  ["use with xlink:href", `<svg viewBox="0 0 1 1"><rect width="1" height="1"/><use xlink:href="http://evil.example/x#a"/></svg>`],
  ["'>' inside an attribute value", `<svg viewBox="0 0 1 1"><rect width="1" height="1" d="a>b" onload="alert(1)"/></svg>`],
];

const FORBIDDEN =
  /script|onload|onerror|foreignObject|javascript:|evil\.example|<a\b|<image\b|<use\b|<style\b|xlink/i;

for (const [label, payload] of attacks) {
  const result = sanitizeSvg(payload);
  const markup = result.ok ? result.svg : "";
  check(label, !FORBIDDEN.test(markup), markup);
}

console.log("\nInput that must be rejected outright");

const rejected: [string, string][] = [
  ["doctype / entity declaration", `<!DOCTYPE svg [<!ENTITY a "aaa">]><svg viewBox="0 0 1 1"><rect width="1" height="1"/></svg>`],
  ["not an svg at all", `<html><body>hi</body></html>`],
  ["empty input", ``],
  ["no viewBox and no size", `<svg xmlns="http://www.w3.org/2000/svg"><rect x="1"/></svg>`],
  ["nothing drawable left", `<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>`],
];

for (const [label, payload] of rejected) {
  const result = sanitizeSvg(payload);
  check(label, !result.ok, result.ok ? result.svg : "");
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
