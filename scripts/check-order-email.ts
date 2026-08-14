import {
  escapeHtml,
  renderOrderEmail,
  subtotalOf,
  type OrderEmailInput,
} from "../src/lib/orders/email-template";
import { orderReference } from "../src/lib/orders/reference";
import { formatPrice } from "../src/lib/products/format";

/**
 * Checks for order email.
 *
 * Same reasoning as the other suites: this is what a customer is told about
 * money they have spent, and it lands in a mail client, which is a browser.
 * Three things are being defended.
 *
 * The arithmetic has to agree with the order — a receipt whose lines do not add
 * up to its total is worse than no receipt. Names and addresses are typed by
 * people and interpolated into HTML, so every one of them has to be escaped.
 * And the receipt link has to be absolute, or it is not clickable from a
 * mailbox.
 *
 *   npm run check:order-email
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

const BASE: OrderEmailInput = {
  id: "cmsb5b45c001fs0u7m4oxekf0",
  kind: "PLACED",
  lines: [
    { name: "ASUS ProArt Studiobook 16", variant: "32 GB / 1 TB", color: "Space Grey", quantity: 1, priceCents: 249900 },
    { name: "Aurora Wireless Headphones", variant: null, color: null, quantity: 2, priceCents: 24900 },
  ],
  shippingCents: 0,
  discountCents: 0,
  discountLabel: null,
  totalCents: 299700,
  shippingName: "Sam Rivera",
  shippingLine1: "12 Bridge Street",
  shippingLine2: null,
  shippingCity: "Bristol",
  shippingRegion: null,
  shippingPostcode: "BS1 4ND",
  shippingCountry: "United Kingdom",
  fulfilment: "DELIVERY",
  pickupAddress: null,
  pickupHours: null,
  receiptUrl: "https://shop.example.com/orders/cmsb5b45c001fs0u7m4oxekf0",
};

/** The same order, collected from the shop instead. */
const PICKUP: OrderEmailInput = {
  ...BASE,
  fulfilment: "PICKUP",
  // A collection order carries the collector's name and nothing else — see the
  // note on `Order`.
  shippingLine1: null,
  shippingCity: null,
  shippingPostcode: null,
  shippingCountry: null,
  pickupAddress: "Ecom Store\n4 Market Square",
  pickupHours: "Sun–Fri, 10am–7pm",
};

console.log("\nThe arithmetic");

check(
  "the subtotal is the lines, quantity included",
  subtotalOf(BASE.lines) === 249900 + 24900 * 2,
  String(subtotalOf(BASE.lines)),
);

// Amounts are written through `formatPrice`, the same function the template
// uses, rather than as literal strings. The shop's currency is a build-time
// setting and the catalogue has already moved once — assertions that spell out
// "$2,997.00" test the currency the suite was written under, not the receipt.
const money = formatPrice;

const placed = renderOrderEmail(BASE);
check("the total appears", placed.text.includes(money(299700)), money(299700));
check("the subtotal appears", placed.text.includes(money(299700)), money(299700));
check(
  "a line total is quantity × price",
  placed.text.includes(money(24900 * 2)),
  `2 × ${money(24900)} = ${money(24900 * 2)}`,
);
check(
  `free delivery says so rather than ${money(0)}`,
  placed.text.includes("Delivery: Free"),
);
check("no discount row when none applied", !placed.text.includes("Discount"));

const discounted = renderOrderEmail({
  ...BASE,
  discountCents: 30000,
  discountLabel: "SAVE10 · 10% off",
  shippingCents: 999,
  totalCents: 279699,
});
check("the discount label is used when there is one", discounted.text.includes("SAVE10"));
check(
  "the discount is shown as a deduction",
  discounted.text.includes(`−${money(30000)}`),
  `−${money(30000)}`,
);
check(
  "paid delivery shows its price",
  discounted.text.includes(`Delivery: ${money(999)}`),
  `Delivery: ${money(999)}`,
);

console.log("\nThe subject and reference");

check(
  "the subject carries the short reference the receipt shows",
  placed.subject.includes(orderReference(BASE.id)),
  placed.subject,
);
check("placing an order confirms it", placed.subject.startsWith("Order confirmed"));
check(
  "shipping says shipped",
  renderOrderEmail({ ...BASE, kind: "SHIPPED" }).subject.startsWith("Order shipped"),
);
check(
  "cancelling says cancelled",
  renderOrderEmail({ ...BASE, kind: "CANCELLED" }).subject.startsWith("Order cancelled"),
);
check(
  "payment says payment",
  renderOrderEmail({ ...BASE, kind: "PAID" }).subject.startsWith("Payment confirmed"),
);

console.log("\nThe link is absolute");

check("the text body carries the receipt URL", placed.text.includes(BASE.receiptUrl));
check("so does the HTML", placed.html.includes(BASE.receiptUrl));
check(
  "and it is absolute — a relative href is not clickable from a mailbox",
  /^https?:\/\//.test(BASE.receiptUrl) && placed.html.includes(`href="${BASE.receiptUrl}"`),
);

console.log("\nEverything people type is escaped");

check("ampersand", escapeHtml("Tom & Jerry") === "Tom &amp; Jerry");
check("angle brackets", escapeHtml("<script>") === "&lt;script&gt;");
check("quotes", escapeHtml(`"x" 'y'`) === "&quot;x&quot; &#39;y&#39;");
check(
  "ampersand first, so entities are not double-escaped",
  escapeHtml("&lt;") === "&amp;lt;",
  escapeHtml("&lt;"),
);

// The attack this closes: a product name, a colour or an address line is typed
// by an admin or a customer and lands in a mail client, which renders HTML.
const hostile = renderOrderEmail({
  ...BASE,
  lines: [
    {
      name: `<img src=x onerror="alert(1)">`,
      variant: `<b>16 GB</b>`,
      color: `"><script>alert(2)</script>`,
      quantity: 1,
      priceCents: 1000,
    },
  ],
  shippingName: `<script>alert(3)</script>`,
  shippingLine1: `12 O'Brien & Sons <Ltd>`,
  discountLabel: `<i>SNEAKY</i>`,
  discountCents: 100,
});

// `<img src=x` rather than a bare `<img`: the body legitimately contains image
// tags of its own now — the status marks and the product thumbnails, which are
// `cid:` references to attached art — so searching for the bare tag would fire
// on the template's own markup and say nothing about the input. The payload as
// typed is the thing that must not survive. The tag count below is the real
// invariant either way.
for (const needle of ["<script", "<img src=x", "<b>", "<i>"]) {
  check(`no raw ${needle} survives into the HTML`, !hostile.html.includes(needle), needle);
}
check(
  "the escaped forms are there instead, so the text is not simply dropped",
  hostile.html.includes("&lt;script") && hostile.html.includes("&lt;img"),
);

/**
 * The invariant the substring checks above only approximate.
 *
 * Searching for `onerror=` was the first instinct and it is the wrong test: it
 * fires on `&lt;img src=x onerror=&quot;…&quot;&gt;`, which is inert — the `<`
 * and the quotes are entities, so the whole thing renders as visible text and
 * the "attribute" belongs to no tag. What actually matters is not which
 * characters appear but whether the input produced any *markup*: escaping works
 * exactly when hostile input yields the same number of tags as harmless input
 * in the same shape.
 */
const benignTwin = renderOrderEmail({
  ...BASE,
  lines: [{ name: "Plain", variant: "Plain", color: "Plain", quantity: 1, priceCents: 1000 }],
  shippingName: "Plain",
  shippingLine1: "Plain",
  discountLabel: "Plain",
  discountCents: 100,
});
const tagCount = (html: string) => (html.match(/<[a-zA-Z/]/g) ?? []).length;
check(
  "hostile input opens no tags a harmless order would not",
  tagCount(hostile.html) === tagCount(benignTwin.html),
  `hostile ${tagCount(hostile.html)} vs benign ${tagCount(benignTwin.html)}`,
);
check(
  "an apostrophe in an address is escaped, not mangled",
  hostile.html.includes("O&#39;Brien &amp; Sons"),
);

console.log("\nAn order with no address still renders");

const addressless = renderOrderEmail({
  ...BASE,
  shippingName: null,
  shippingLine1: null,
  shippingLine2: null,
  shippingCity: null,
  shippingRegion: null,
  shippingPostcode: null,
  shippingCountry: null,
});
check("no empty 'Delivering to' block in the text", !addressless.text.includes("Delivering to"));
check("nor in the HTML", !addressless.html.includes("Delivering to"));
check("and the receipt link is still there", addressless.text.includes(BASE.receiptUrl));
check("and the total is still there", addressless.text.includes(money(299700)));

console.log("\nA collection order is told where to come");

const collected = renderOrderEmail(PICKUP);
check(
  "the charge row is Collection, not Delivery",
  collected.text.includes("Collection:") && !collected.text.includes("Delivery:"),
);
check(
  "the block is headed Collect from",
  collected.text.includes("Collect from:"),
);
check("and it names the shop", collected.text.includes("4 Market Square"));
check(
  "the address is broken into lines, not run together",
  collected.text.includes("Ecom Store\n4 Market Square"),
);
check("the opening hours come through", collected.text.includes("Sun–Fri, 10am–7pm"));
check(
  "the collector is still named",
  collected.text.includes("Sam Rivera"),
);
// The whole point of the wording: a customer told their order has shipped goes
// looking for a tracking number that does not exist.
check(
  "a collected order is not described as shipped",
  !renderOrderEmail({ ...PICKUP, kind: "SHIPPED" }).text.includes("Delivering to"),
);
check("the HTML says it too", collected.html.includes("Collect from"));

console.log("\nBoth bodies are always produced");

for (const kind of ["PLACED", "PENDING", "PAID", "SHIPPED", "CANCELLED"] as const) {
  const rendered = renderOrderEmail({ ...BASE, kind });
  if (!rendered.subject || !rendered.text.trim() || !rendered.html.trim()) {
    check(`${kind} produces a subject, text and HTML`, false);
  }
}
check("every kind produces a subject, text and HTML", true);

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
