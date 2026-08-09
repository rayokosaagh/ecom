import { SocialPlatform } from "../src/generated/prisma/enums";
import {
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_ORDER,
  isSocialPlatform,
  socialLinkName,
} from "../src/lib/social/catalogue";
import {
  normalizeHexColor,
  readableOn,
  resolveHoverColor,
} from "../src/lib/social/color";
import {
  MAX_LABEL_LENGTH,
  parseSocialLink,
  toSocialUrl,
} from "../src/lib/social/validation";

/**
 * Checks for social link validation and the platform catalogue.
 *
 * This is the contract `parseSocialLink` has to meet — the admin form places
 * its error messages by key, and the home page renders whatever gets stored
 * straight into an `href` under a brand logo, so both ends depend on this
 * function agreeing with them.
 *
 *   npm run check:social
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

// `set`, not `append`: `valid(overrides)` spreads its overrides after the base
// entries and means for them to replace it. Appending instead leaves two values
// under the key, and `formData.get` reads the first.
function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.set(key, value);
  return data;
}

const valid = (overrides: [string, string][] = []) =>
  form([
    ["platform", SocialPlatform.INSTAGRAM],
    ["url", "https://instagram.com/ecomgear"],
    ["label", "@ecomgear"],
    ["published", "on"],
    ...overrides,
  ]);

console.log("\nA complete submission is accepted");

const ok = parseSocialLink(valid());
check("it parses", ok.ok);
check(
  "the platform comes through",
  ok.ok && ok.data.platform === SocialPlatform.INSTAGRAM,
);
check(
  "so does the url",
  ok.ok && ok.data.url === "https://instagram.com/ecomgear",
);
check("so does the label", ok.ok && ok.data.label === "@ecomgear");
check("published is on", ok.ok && ok.data.published === true);

console.log("\nAn unchecked box means hidden, not missing");

const hidden = parseSocialLink(
  form([
    ["platform", SocialPlatform.X],
    ["url", "https://x.com/ecomgear"],
  ]),
);
check("it still parses", hidden.ok);
check("published is off", hidden.ok && hidden.data.published === false);
check("an empty label becomes null", hidden.ok && hidden.data.label === null);

console.log("\nThe link is required, and so is a known platform");

const noUrl = parseSocialLink(valid([["url", "   "]]));
check("blank url is rejected", !noUrl.ok);
check("under the url key", !noUrl.ok && Boolean(noUrl.errors.url));

const noPlatform = parseSocialLink(valid([["platform", ""]]));
check("missing platform is rejected", !noPlatform.ok);
check(
  "under the platform key",
  !noPlatform.ok && Boolean(noPlatform.errors.platform),
);

const bogusPlatform = parseSocialLink(valid([["platform", "MYSPACE"]]));
check("an unknown platform is rejected", !bogusPlatform.ok);
check(
  "and does not also complain about the url it never checked",
  !bogusPlatform.ok && bogusPlatform.errors.url === undefined,
);

console.log("\nA link has to point at the platform it is labelled with");

// The mistake this whole check exists for: the right address in the wrong row
// ships a logo that lies about where it goes.
const wrongHost = parseSocialLink(
  valid([["url", "https://linkedin.com/company/ecomgear"]]),
);
check("a LinkedIn url under Instagram is rejected", !wrongHost.ok);
check(
  "and the message names the platform expected",
  !wrongHost.ok && (wrongHost.errors.url ?? "").includes("Instagram"),
);

// Found by clicking the real form: a *bare* domain skips the scheme and the
// slash that make the rejection above obvious, so the handle fallback used to
// swallow it and store `instagram.com/facebook.com` — no error, and a link that
// goes nowhere.
const bareWrongHost = parseSocialLink(valid([["url", "facebook.com"]]));
check("a bare foreign domain is rejected too", !bareWrongHost.ok);
check(
  "and is not quietly turned into a handle",
  toSocialUrl(SocialPlatform.INSTAGRAM, "facebook.com") === null,
);
check(
  "nor is one with a subdomain",
  toSocialUrl(SocialPlatform.X, "music.youtube.com") === null,
);
check(
  "but the platform's own bare domain still resolves",
  toSocialUrl(SocialPlatform.INSTAGRAM, "instagram.com") ===
    "https://instagram.com/",
);

check(
  "a subdomain of the platform is fine",
  toSocialUrl(SocialPlatform.YOUTUBE, "https://music.youtube.com/@ecomgear") !==
    null,
);
check(
  "a lookalike host is not",
  toSocialUrl(SocialPlatform.YOUTUBE, "https://youtube.com.evil.test/x") ===
    null,
);
check(
  "twitter.com still counts as X",
  toSocialUrl(SocialPlatform.X, "https://twitter.com/ecomgear") !== null,
);
check(
  "CUSTOM accepts any host",
  toSocialUrl(SocialPlatform.CUSTOM, "https://ecomgear.example/blog") !== null,
);

console.log("\nOnly http(s) becomes an href");

for (const scheme of [
  "javascript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "ftp://instagram.com/ecomgear",
  "mailto:hi@instagram.com",
]) {
  check(
    `${scheme.split(":")[0]}: is rejected`,
    toSocialUrl(SocialPlatform.CUSTOM, scheme) === null,
  );
}

check(
  "http is upgraded rather than refused",
  toSocialUrl(SocialPlatform.INSTAGRAM, "http://instagram.com/ecomgear") ===
    "https://instagram.com/ecomgear",
);

console.log("\nWhat an admin actually types is accepted");

check(
  "a scheme-less address gets https",
  toSocialUrl(SocialPlatform.INSTAGRAM, "instagram.com/ecomgear") ===
    "https://instagram.com/ecomgear",
);
check(
  "www. is dropped so one profile stores one way",
  toSocialUrl(SocialPlatform.INSTAGRAM, "https://www.instagram.com/ecomgear") ===
    "https://instagram.com/ecomgear",
);
check(
  "a bare handle expands",
  toSocialUrl(SocialPlatform.INSTAGRAM, "ecomgear") ===
    "https://instagram.com/ecomgear",
);
check(
  "a leading @ is not doubled up",
  toSocialUrl(SocialPlatform.TIKTOK, "@ecomgear") ===
    "https://tiktok.com/@ecomgear",
);
check(
  "a handle is refused where the platform has no stable shape for one",
  toSocialUrl(SocialPlatform.YOUTUBE, "ecomgear") === null,
);
check(
  "and so is a handle with a space in it",
  toSocialUrl(SocialPlatform.INSTAGRAM, "ecom gear") === null,
);

// The two shapes that defeat any up-front "is this a URL?" test, and the
// reason the address attempt falls back to the handle one rather than
// deciding between them by inspection.
check(
  "a handle containing a dot is still a handle, not a hostname",
  toSocialUrl(SocialPlatform.INSTAGRAM, "ecom.gear") ===
    "https://instagram.com/ecom.gear",
);
check(
  "a single-label host is not mistaken for an address",
  toSocialUrl(SocialPlatform.CUSTOM, "ecomgear") === null,
);

console.log("\nThe label is bounded");

const longLabel = parseSocialLink(
  valid([["label", "a".repeat(MAX_LABEL_LENGTH + 1)]]),
);
check("an over-long label is rejected", !longLabel.ok);
check("under the label key", !longLabel.ok && Boolean(longLabel.errors.label));
check(
  "one exactly at the limit is accepted",
  parseSocialLink(valid([["label", "a".repeat(MAX_LABEL_LENGTH)]])).ok,
);

console.log("\nA custom link carries its own identity");

const customBase = (overrides: [string, string][] = []) =>
  form([
    ["platform", SocialPlatform.CUSTOM],
    ["url", "https://ecomgear.example/blog"],
    ["label", "Our blog"],
    ["published", "on"],
    ...overrides,
  ]);

const custom = parseSocialLink(customBase());
check("it parses", custom.ok);
check("any host is allowed", custom.ok && custom.data.url.includes("ecomgear.example"));

// The label is what a custom link is announced by — there is no network name
// to fall back on, so an empty one would have the bar saying "Custom".
const unnamed = parseSocialLink(customBase([["label", "  "]]));
check("a custom link without a name is rejected", !unnamed.ok);
check("under the label key", !unnamed.ok && Boolean(unnamed.errors.label));
check(
  "while a built-in without one is still fine",
  parseSocialLink(valid([["label", ""]])).ok,
);

const withMark = parseSocialLink(
  customBase([
    ["iconSvg", '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>'],
  ]),
);
check("a pasted mark is kept", withMark.ok && Boolean(withMark.data.iconSvg));
check(
  "and it is the sanitized form, not what was pasted",
  withMark.ok && withMark.data.iconSvg!.startsWith("<svg xmlns="),
);

// The whole reason the mark goes through `lib/brands/svg`: this markup is
// inlined into the home page.
const hostile = parseSocialLink(
  customBase([
    [
      "iconSvg",
      '<svg viewBox="0 0 24 24"><script>alert(1)</script><path d="M0 0h24v24H0z"/></svg>',
    ],
  ]),
);
check(
  "a script in a pasted mark does not survive",
  hostile.ok && !hostile.data.iconSvg!.includes("script"),
);
check(
  "markup that sanitizes to nothing is an error, not a silent drop",
  !parseSocialLink(customBase([["iconSvg", "<b>not an svg</b>"]])).ok,
);

// A built-in's mark comes from the catalogue, so anything in the field is
// stale — left behind by switching the dropdown after pasting.
check(
  "a mark submitted for a built-in platform is ignored",
  (() => {
    const r = parseSocialLink(
      valid([["iconSvg", '<svg viewBox="0 0 24 24"><path d="M0 0h1v1H0z"/></svg>']]),
    );
    return r.ok && r.data.iconSvg === null;
  })(),
);

console.log("\nThe hover colour is an override, not a copy");

check(
  "no colour submitted means follow the platform",
  ok.ok && ok.data.hoverColor === null,
);
// The picker has no empty state, so it always submits something. Matching the
// default has to read as "never touched it" or every save would freeze the
// colour of every link.
check(
  "submitting the platform's own colour also means follow it",
  (() => {
    const r = parseSocialLink(
      valid([["hoverColor", SOCIAL_PLATFORMS[SocialPlatform.INSTAGRAM].brandColor]]),
    );
    return r.ok && r.data.hoverColor === null;
  })(),
);
check(
  "a different colour is stored",
  (() => {
    const r = parseSocialLink(valid([["hoverColor", "#123456"]]));
    return r.ok && r.data.hoverColor === "#123456";
  })(),
);
check(
  "case and shorthand are normalized before that comparison",
  (() => {
    const r = parseSocialLink(valid([["hoverColor", "#ABC"]]));
    return r.ok && r.data.hoverColor === "#aabbcc";
  })(),
);
check(
  "a colour that is not one is rejected",
  !parseSocialLink(valid([["hoverColor", "rebeccapurple"]])).ok,
);
check(
  "under the hoverColor key",
  (() => {
    const r = parseSocialLink(valid([["hoverColor", "#12345"]]));
    return !r.ok && Boolean(r.errors.hoverColor);
  })(),
);

console.log("\nColour arithmetic");

check("hex normalizes with or without the hash", normalizeHexColor("e4405f") === "#e4405f");
check("shorthand expands", normalizeHexColor("#FFF") === "#ffffff");
check("nonsense does not", normalizeHexColor("#gggggg") === null);
check("and neither does an empty string", normalizeHexColor("   ") === null);

// The point of computing rather than storing the pair: no colour an admin can
// choose is allowed to produce an unreadable glyph.
check("white text on black", readableOn("#000000") === "#ffffff");
check("dark text on white", readableOn("#ffffff") !== "#ffffff");
check("dark text on yellow", readableOn("#ffff00") !== "#ffffff");
check("white text on a mid blue", readableOn("#0b57d0") === "#ffffff");
check("white text on Instagram pink", readableOn("#e4405f") === "#ffffff");

check(
  "a link with no override resolves to its platform's colour",
  resolveHoverColor(SocialPlatform.YOUTUBE, null) === "#ff0000",
);
check(
  "an override wins",
  resolveHoverColor(SocialPlatform.YOUTUBE, "#00ff00") === "#00ff00",
);
check(
  "and a corrupt override falls back rather than reaching the page",
  resolveHoverColor(SocialPlatform.YOUTUBE, "not a colour") === "#ff0000",
);

console.log("\nEvery platform is complete");

for (const platform of SOCIAL_PLATFORM_ORDER) {
  const info = SOCIAL_PLATFORMS[platform];
  check(
    `${platform} has a name and a hint`,
    Boolean(info.name) && Boolean(info.hint),
  );
  check(
    `${platform} has a usable hover colour`,
    normalizeHexColor(info.brandColor) === info.brandColor,
  );
  // CUSTOM is the one member with neither, by design — it is the escape hatch
  // for networks with no entry here, and it brings its own mark.
  if (platform !== SocialPlatform.CUSTOM) {
    check(`${platform} has a mark`, Boolean(info.path));
    check(`${platform} restricts its hosts`, info.hosts.length > 0);
  }
}

check(
  "the catalogue covers the enum exactly",
  SOCIAL_PLATFORM_ORDER.length === Object.keys(SocialPlatform).length,
  `catalogue has ${SOCIAL_PLATFORM_ORDER.length}, enum has ${Object.keys(SocialPlatform).length}`,
);

check("a real member is recognised", isSocialPlatform("INSTAGRAM"));
check("an invented one is not", !isSocialPlatform("MYSPACE"));
// `Object.hasOwn` rather than `in`, so nothing inherited from Object.prototype
// can be mistaken for a platform.
check("and neither is a prototype key", !isSocialPlatform("toString"));

console.log("\nA link's name falls back to the platform");

check(
  "the label wins where there is one",
  socialLinkName(SocialPlatform.INSTAGRAM, "@ecomgear") === "@ecomgear",
);
check(
  "the platform name stands in where there is not",
  socialLinkName(SocialPlatform.INSTAGRAM, null) === "Instagram",
);
check(
  "a whitespace-only label counts as none",
  socialLinkName(SocialPlatform.INSTAGRAM, "   ") === "Instagram",
);

console.log(
  failures === 0
    ? "\nAll checks passed.\n"
    : `\n${failures} check${failures === 1 ? "" : "s"} failed.\n`,
);

process.exit(failures === 0 ? 0 : 1);
