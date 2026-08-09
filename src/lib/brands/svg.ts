/**
 * Sanitizer for admin-supplied brand icons.
 *
 * Brand icons are stored as SVG *markup* and inlined into the page, which
 * makes that markup a script-execution surface. This module is the boundary
 * that makes it safe, and every write to `Brand.iconSvg` goes through it.
 *
 * Why inline markup at all, rather than serving `/uploads/acme.svg` from an
 * `<img>`? Because an SVG served from our own origin runs its scripts when the
 * URL is opened directly — an upload form writing into `public/` would be
 * stored XSS on the site's own domain, reachable by anyone handed the link.
 * Inlined markup has no such URL, and as a bonus an icon with no explicit fill
 * can be *given* `currentColor` by the surface it sits on, so one file works in
 * both themes. Note "given", not "inherits": SVG's `fill` defaults to black,
 * not to `currentColor`, so a mark with no fill of its own renders black
 * wherever it lands unless something sets it. `BrandIcon` is what sets it, and
 * is the only thing that should render this markup.
 *
 * Two rules do most of the work:
 *
 *  1. Rebuild, never strip. The output is assembled from scratch out of
 *     allowlisted elements and attributes, so anything unrecognised is simply
 *     never emitted. A blocklist has to anticipate every vector; an unknown
 *     element here fails closed.
 *  2. Drop unknown elements *with their subtree*. `<script>` is the obvious
 *     case, but `<foreignObject>` smuggles arbitrary HTML and `<metadata>`
 *     smuggles arbitrary RDF, so the children go with the parent.
 *
 * No DOM is used, so this runs unchanged in the browser — the admin field
 * previews exactly the markup the server will store, rather than a lookalike.
 */

/** Sanitized markup is stored in a column and inlined on every product card. */
export const MAX_SVG_BYTES = 64 * 1024;

/** Generous ceiling on what may be *submitted*, before sanitizing shrinks it. */
export const MAX_SVG_INPUT_BYTES = 256 * 1024;

/**
 * Elements that may appear in the output.
 *
 * Deliberately short: this is a logo, not a document. `<use>` and `<image>`
 * are absent because both take an href that can reach off-origin, `<style>`
 * because CSS can fetch, and `<animate>`/`<set>` because SVG animation
 * elements can target arbitrary attributes on arbitrary nodes.
 */
const ALLOWED_ELEMENTS = new Set([
  "svg",
  "g",
  "defs",
  "title",
  "desc",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
  "mask",
]);

/**
 * Attributes that may appear in the output, in their exact SVG casing —
 * `viewBox` and `gradientUnits` are case-sensitive and would be dropped by a
 * lowercased comparison.
 *
 * `style` is absent on purpose: it accepts `url(…)` and is the usual way to
 * smuggle a fetch past an element allowlist. `class` is absent because these
 * icons are inlined into pages with their own stylesheet, and a stray class
 * name would let a logo restyle its surroundings.
 */
const ALLOWED_ATTRIBUTES = new Set([
  // Structure
  "id",
  "viewBox",
  "preserveAspectRatio",
  "xmlns",
  "transform",
  "clipPathUnits",
  "maskUnits",
  "maskContentUnits",
  // Geometry
  "d",
  "points",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "width",
  "height",
  "dx",
  "dy",
  // Paint
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-miterlimit",
  "opacity",
  "color",
  "clip-path",
  "clip-rule",
  "mask",
  "paint-order",
  "vector-effect",
  "display",
  // Gradients
  "offset",
  "stop-color",
  "stop-opacity",
  "gradientUnits",
  "gradientTransform",
  "spreadMethod",
  "fx",
  "fy",
  // Text
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "text-anchor",
  "letter-spacing",
  "dominant-baseline",
]);

/** Elements that count as "something is actually drawn". */
const DRAWABLE = new Set([
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
]);

export type SanitizeSvgResult =
  | { ok: true; svg: string; viewBox: string }
  | { ok: false; error: string };

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/**
 * Resolve entities before an attribute value is inspected.
 *
 * Without this, `fill="&#117;rl(http://evil.example/x)"` would sail past the
 * `url(` check as literal text and be reassembled by the parser afterwards.
 * Validation has to see what the renderer will see.
 */
function decodeEntities(value: string): string {
  return value.replace(/&(#[Xx][0-9A-Fa-f]+|#\d+|[A-Za-z]+);/g, (_match, body: string) => {
    try {
      if (body[0] === "#") {
        const hex = body[1] === "x" || body[1] === "X";
        const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : "";
      }
      return NAMED_ENTITIES[body.toLowerCase()] ?? "";
    } catch {
      // Out-of-range code point. Dropping it is right: it was not going to
      // render as anything meaningful either way.
      return "";
    }
  });
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Reject a decoded attribute value that could reach outside the document.
 *
 * Paint references are the one place a value legitimately points at something,
 * and they may only point at an element in this same icon.
 */
function isSafeValue(value: string): boolean {
  if (/[<>]/.test(value)) return false;
  if (/(?:javascript|vbscript|data)\s*:/i.test(value)) return false;

  for (const match of value.matchAll(/url\(\s*(['"]?)([^)]*?)\1\s*\)/gi)) {
    if (!match[2].trim().startsWith("#")) return false;
  }

  return true;
}

interface OpenTag {
  name: string;
  attributes: Map<string, string>;
  selfClosing: boolean;
}

/** Attribute values arrive quoted, apostrophe-quoted, or (rarely) bare. */
const ATTRIBUTE_PATTERN =
  /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

function parseAttributes(raw: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const match of raw.matchAll(ATTRIBUTE_PATTERN)) {
    attributes.set(match[1], decodeEntities(match[2] ?? match[3] ?? match[4] ?? ""));
  }
  return attributes;
}

/**
 * Tag matcher. The quoted-string alternations are what keep a `>` inside an
 * attribute value from ending the tag early.
 */
const TAG_PATTERN = /<(\/?)([A-Za-z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;

/**
 * Namespaced markup is common in editor exports. `svg:rect` is a rect;
 * `inkscape:whatever` is not something we know, so it falls through to the
 * allowlist and is dropped with its subtree.
 */
function localName(name: string): string {
  return name.startsWith("svg:") ? name.slice(4) : name;
}

/**
 * Namespace every `id` in the icon and rewrite the references that point at
 * them.
 *
 * Two logos exported from the same editor both tend to call their first
 * gradient `id="a"`. Inlined side by side on a product grid, the second one's
 * `url(#a)` resolves to the *first* one's gradient — one brand silently
 * wearing another's colours. Prefixing makes each icon's ids its own.
 *
 * The prefix is a hash of the icon itself rather than anything about the brand
 * that owns it, so renaming a brand cannot change its ids, and it carries a
 * fixed marker so that re-sanitizing already-namespaced markup strips the old
 * prefix instead of stacking a second one on top.
 */
const ID_PREFIX_MARKER = /\bbi[0-9a-f]{8}-/g;

/** FNV-1a. Not security-relevant — this only needs to spread ids apart. */
function iconPrefix(source: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `bi${hash.toString(16).padStart(8, "0")}`;
}

function prefixId(value: string, prefix: string): string {
  return `${prefix}-${value}`;
}

function rewriteReferences(value: string, prefix: string): string {
  return value.replace(
    /url\(\s*(['"]?)#([^)'"]+)\1\s*\)/gi,
    (_match, _quote, id: string) => `url(#${prefixId(id.trim(), prefix)})`,
  );
}

function serializeAttributes(
  attributes: Map<string, string>,
  prefix: string,
): string {
  const parts: string[] = [];

  for (const [name, rawValue] of attributes) {
    if (!ALLOWED_ATTRIBUTES.has(name)) continue;

    const value =
      name === "id"
        ? prefixId(rawValue.trim(), prefix)
        : rewriteReferences(rawValue, prefix);

    if (!isSafeValue(value)) continue;
    parts.push(`${name}="${escapeAttribute(value)}"`);
  }

  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

/**
 * Work out the coordinate system the icon draws in.
 *
 * A `viewBox` is what lets the mark scale to whatever box the page gives it.
 * Plenty of exports carry only `width`/`height`, so one is synthesized from
 * those — and the root's own width/height are then dropped, because a fixed
 * pixel size on the root would override the CSS sizing at every call site.
 */
function resolveViewBox(attributes: Map<string, string>): string | null {
  const existing = attributes.get("viewBox")?.trim();
  if (existing) {
    const numbers = existing.split(/[\s,]+/).map(Number);
    if (numbers.length === 4 && numbers.every(Number.isFinite) && numbers[2] > 0 && numbers[3] > 0) {
      return numbers.join(" ");
    }
  }

  const width = Number.parseFloat(attributes.get("width") ?? "");
  const height = Number.parseFloat(attributes.get("height") ?? "");
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return `0 0 ${width} ${height}`;
  }

  return null;
}

/**
 * Clean an SVG for storage and inlining.
 *
 * @param source Raw markup, as pasted or read from an uploaded file.
 */
export function sanitizeSvg(source: string): SanitizeSvgResult {
  const input = source.trim();

  if (!input) return { ok: false, error: "Paste or upload an SVG first." };

  if (input.length > MAX_SVG_INPUT_BYTES) {
    return { ok: false, error: "That SVG is too large to process." };
  }

  // Rejected rather than stripped: a doctype is the vehicle for entity
  // expansion (billion laughs) and external entity references, and no icon
  // has ever needed one.
  if (/<!DOCTYPE/i.test(input) || /<!ENTITY/i.test(input)) {
    return {
      ok: false,
      error: "That SVG contains a doctype or entity declaration, which is not allowed.",
    };
  }

  // Comments, CDATA and processing instructions (including `<?xml-stylesheet`)
  // carry nothing we keep, and removing them first keeps the tag matcher from
  // having to reason about their contents.
  const stripped = input
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "")
    .replace(/<\?[\s\S]*?\?>/g, "");

  // Undo any namespacing a previous pass applied, so re-saving an icon that is
  // already stored re-derives the same ids rather than prefixing them twice.
  const canonical = stripped.replace(ID_PREFIX_MARKER, "");
  const prefix = iconPrefix(canonical);

  const output: string[] = [];
  /** Depth inside a subtree that is being discarded; 0 means "emitting". */
  let skipDepth = 0;
  /** Depth of allowed open elements, so a stray `</svg>` cannot end the icon. */
  let openDepth = 0;
  let root: OpenTag | null = null;
  let viewBox = "";
  let hasDrawable = false;
  let cursor = 0;

  for (const match of canonical.matchAll(TAG_PATTERN)) {
    const [tag, closing, rawName, rawAttributes, selfClose] = match;
    const index = match.index ?? 0;

    // Text between tags. Only meaningful inside <text>/<title>, but escaping
    // and keeping it everywhere is simpler than tracking which — SVG ignores
    // stray text, and escaped text cannot do anything.
    if (skipDepth === 0 && root) {
      const text = canonical.slice(cursor, index);
      if (text.trim()) output.push(escapeText(text));
    }
    cursor = index + tag.length;

    const name = localName(rawName);
    const isClosing = closing === "/";
    const isSelfClosing = selfClose === "/";

    if (skipDepth > 0) {
      // Track nesting so the discard ends at the *matching* close tag.
      if (isClosing) skipDepth--;
      else if (!isSelfClosing) skipDepth++;
      continue;
    }

    if (isClosing) {
      // `openDepth` counts only children, so the root's own `</svg>` lands
      // here at depth 0 and is dropped — it is re-appended after the loop,
      // alongside the rebuilt opening tag.
      if (!ALLOWED_ELEMENTS.has(name) || openDepth === 0) continue;
      openDepth--;
      output.push(`</${name}>`);
      continue;
    }

    if (!ALLOWED_ELEMENTS.has(name)) {
      if (!isSelfClosing) skipDepth = 1;
      continue;
    }

    const attributes = parseAttributes(rawAttributes);

    if (!root) {
      // Anything before the first <svg> is preamble we already stripped; a
      // different first element means this is not an SVG document.
      if (name !== "svg") {
        return { ok: false, error: "That does not look like an SVG — no <svg> element found." };
      }

      const resolved = resolveViewBox(attributes);
      if (!resolved) {
        return {
          ok: false,
          error: "That SVG has no viewBox and no width/height, so it cannot be scaled.",
        };
      }

      root = { name, attributes, selfClosing: isSelfClosing };
      viewBox = resolved;
      continue;
    }

    if (DRAWABLE.has(name)) hasDrawable = true;

    const serialized = `<${name}${serializeAttributes(attributes, prefix)}`;
    if (isSelfClosing) {
      output.push(`${serialized}/>`);
    } else {
      output.push(`${serialized}>`);
      openDepth++;
    }
  }

  if (!root) {
    return { ok: false, error: "That does not look like an SVG — no <svg> element found." };
  }

  if (!hasDrawable) {
    return {
      ok: false,
      error: "Nothing drawable survived — the icon may rely on scripts, embedded images or CSS.",
    };
  }

  // The root is rebuilt rather than passed through: width/height are dropped
  // so CSS controls the size, and the viewBox is the resolved one.
  const rootAttributes = new Map(root.attributes);
  rootAttributes.delete("width");
  rootAttributes.delete("height");
  rootAttributes.delete("viewBox");
  rootAttributes.delete("xmlns");

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${escapeAttribute(viewBox)}"` +
    `${serializeAttributes(rootAttributes, prefix)}>` +
    `${output.join("")}</svg>`;

  if (svg.length > MAX_SVG_BYTES) {
    return {
      ok: false,
      error: "That icon is too detailed — simplify it, or export it at a lower precision.",
    };
  }

  return { ok: true, svg, viewBox };
}
