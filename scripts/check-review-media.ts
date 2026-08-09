import {
  ACCEPTED_IMAGE_TYPES,
  ACCEPTED_VIDEO_TYPES,
  MAX_REVIEW_MEDIA,
  isUploadedUrl,
  mediaKindFor,
} from "../src/lib/uploads/config";
import { parseReview } from "../src/lib/reviews/validation";

/**
 * Checks for review attachments.
 *
 * Same reasoning as `check:svg`: this is a security boundary, and a boundary
 * with no executable statement of what it blocks is one edit away from
 * silently not blocking it. Two things are being defended here.
 *
 * The first is the URL check. A review submits the URLs its attachments live
 * at; without validation a crafted submission could point one at any address
 * on the internet, and the product page would embed it — a tracking pixel, an
 * image that changes after moderation, or worse.
 *
 * The second is what is NOT in the accepted list. SVG is the one that matters:
 * it is a document that can carry script, and these files are served straight
 * off a public directory.
 *
 *   npm run check:review-media
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

/** A URL of exactly the shape the upload action generates. */
function generated(extension: string): string {
  return `/uploads/m3k2p1-0123456789abcdef.${extension}`;
}

console.log("\nURLs this app generated must be accepted");

for (const extension of Object.values(ACCEPTED_IMAGE_TYPES)) {
  const url = generated(extension);
  check(`image .${extension}`, isUploadedUrl(url) && mediaKindFor(url) === "IMAGE");
}
for (const extension of Object.values(ACCEPTED_VIDEO_TYPES)) {
  const url = generated(extension);
  check(`video .${extension}`, isUploadedUrl(url) && mediaKindFor(url) === "VIDEO");
}

console.log("\nEverything else must be refused");

const refused: [string, string][] = [
  ["absolute http URL", "http://evil.test/uploads/m3k2p1-0123456789abcdef.png"],
  ["absolute https URL", "https://evil.test/uploads/m3k2p1-0123456789abcdef.png"],
  ["protocol-relative URL", "//evil.test/uploads/m3k2p1-0123456789abcdef.png"],
  ["host smuggled before the path", "https://evil.test/uploads/x-0123456789abcdef.png"],
  ["path traversal", "/uploads/../../etc/passwd"],
  ["traversal with a valid tail", "/uploads/../m3k2p1-0123456789abcdef.png"],
  ["query string appended", "/uploads/m3k2p1-0123456789abcdef.png?x=1"],
  ["fragment appended", "/uploads/m3k2p1-0123456789abcdef.png#x"],
  ["a second extension", "/uploads/m3k2p1-0123456789abcdef.png.html"],
  // The separator has to be a literal dot. Written as `\.` inside a template
  // literal it collapses to a bare `.`, which matches any character at all —
  // the pattern still looked right and accepted this.
  ["a non-dot before the extension", "/uploads/m3k2p1-0123456789abcdefXpng"],
  ["SVG", generated("svg")],
  ["HTML", generated("html")],
  ["JavaScript", generated("js")],
  ["QuickTime", generated("mov")],
  ["no extension", "/uploads/m3k2p1-0123456789abcdef"],
  ["wrong directory", "/public/m3k2p1-0123456789abcdef.png"],
  ["uppercase hex in the random part", "/uploads/m3k2p1-0123456789ABCDEF.png"],
  ["short random part", "/uploads/m3k2p1-0123.png"],
  ["data URI", "data:image/png;base64,iVBORw0KGgo="],
  ["javascript URI", "javascript:alert(1)"],
  ["empty", ""],
  ["newline smuggled in", "/uploads/m3k2p1-0123456789abcdef.png\n"],
];

for (const [label, url] of refused) {
  check(label, !isUploadedUrl(url), url);
}

console.log("\nparseReview only keeps attachments that pass");

function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

const good = generated("jpg");
const goodVideo = generated("mp4");

const mixed = parseReview(
  form([
    ["rating", "5"],
    ["body", "A perfectly reasonable review body."],
    ["media", good],
    ["media", "https://evil.test/tracker.gif"],
    ["media", generated("svg")],
    ["media", goodVideo],
  ]),
);
check("valid entries survive", mixed.ok && mixed.data.media.length === 2);
check(
  "foreign and SVG entries are dropped",
  mixed.ok && mixed.data.media.every((m) => m.url === good || m.url === goodVideo),
  mixed.ok ? JSON.stringify(mixed.data.media) : "",
);
check(
  "kinds are derived, not submitted",
  mixed.ok &&
    mixed.data.media.find((m) => m.url === goodVideo)?.kind === "VIDEO" &&
    mixed.data.media.find((m) => m.url === good)?.kind === "IMAGE",
);

const duplicated = parseReview(
  form([
    ["rating", "4"],
    ["body", "A perfectly reasonable review body."],
    ["media", good],
    ["media", good],
    ["media", good],
  ]),
);
check("duplicates collapse", duplicated.ok && duplicated.data.media.length === 1);

// One more than the cap, all distinct and all valid.
const tooMany = parseReview(
  form([
    ["rating", "4"],
    ["body", "A perfectly reasonable review body."],
    ...Array.from(
      { length: MAX_REVIEW_MEDIA + 1 },
      (_unused, i) =>
        ["media", `/uploads/m3k2p${i}-0123456789abcde${i}.jpg`] as [string, string],
    ),
  ]),
);
check(`more than ${MAX_REVIEW_MEDIA} is rejected`, !tooMany.ok);

const noMedia = parseReview(
  form([
    ["rating", "4"],
    ["body", "A perfectly reasonable review body."],
  ]),
);
check("a review with no attachments is fine", noMedia.ok && noMedia.data.media.length === 0);

console.log("\nSVG is absent from every accepted list");
check(
  "not an accepted image type",
  !Object.keys(ACCEPTED_IMAGE_TYPES).some((type) => type.includes("svg")),
);
check(
  "not an accepted extension",
  !Object.values(ACCEPTED_IMAGE_TYPES).includes("svg" as never),
);

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
