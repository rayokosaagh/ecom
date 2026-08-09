import { FulfilmentMethod } from "../src/generated/prisma/enums";
import {
  deliveryChargeFor,
  fulfilmentLabels,
  isFulfilmentMethod,
  pickupAvailable,
} from "../src/lib/checkout/fulfilment";
import {
  FLAT_SHIPPING_CENTS,
  FREE_SHIPPING_OVER_CENTS,
} from "../src/lib/checkout/shipping";
import { parseFulfilment } from "../src/lib/checkout/validation";

/**
 * Checks for delivery-or-collection.
 *
 * Three things are being defended.
 *
 * **The quote and the charge must agree.** The checkout summary re-totals in
 * the browser as the radio moves and the action commits on the server, and both
 * call `deliveryChargeFor` — a checkout that shows one figure and charges
 * another is the worst outcome this feature could produce.
 *
 * **A collection order must not be validated as a delivery.** The address
 * fields are unmounted when collection is chosen, so demanding a postcode would
 * make the order unplaceable; equally, a form claiming collection at a shop
 * with no counter must be refused rather than quietly posted to an address the
 * shopper deliberately declined to give.
 *
 * **Collection must never be offered without somewhere to collect from.**
 *
 *   npm run check:fulfilment
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

function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.set(key, value);
  return data;
}

/** A filled-in delivery address. */
const address = (): [string, string][] => [
  ["shippingName", "Sam Rivera"],
  ["shippingLine1", "12 Bridge Street"],
  ["shippingCity", "Bristol"],
  ["shippingPostcode", "BS1 4ND"],
  ["shippingCountry", "United Kingdom"],
];

console.log("\nCollection is free, and free unconditionally");

// Not "free because the basket cleared the threshold" — nothing is being
// carried, so there is no charge to waive.
check(
  "a small basket collected is free",
  deliveryChargeFor(FulfilmentMethod.PICKUP, 1) === 0,
);
check(
  "an empty one too",
  deliveryChargeFor(FulfilmentMethod.PICKUP, 0) === 0,
);
check(
  "and a large one",
  deliveryChargeFor(FulfilmentMethod.PICKUP, FREE_SHIPPING_OVER_CENTS * 10) === 0,
);

console.log("\nDelivery keeps the rate it always had");

check(
  "below the threshold is charged the flat rate",
  deliveryChargeFor(FulfilmentMethod.DELIVERY, FREE_SHIPPING_OVER_CENTS - 1) ===
    FLAT_SHIPPING_CENTS,
);
check(
  "at the threshold is free",
  deliveryChargeFor(FulfilmentMethod.DELIVERY, FREE_SHIPPING_OVER_CENTS) === 0,
);
check(
  "an empty basket is not charged for delivery",
  deliveryChargeFor(FulfilmentMethod.DELIVERY, 0) === 0,
);

console.log("\nA delivery is parsed as it always was");

const delivered = parseFulfilment(form(address()), true);
check("it parses", delivered.ok);
check(
  "as a delivery",
  delivered.ok && delivered.data.method === FulfilmentMethod.DELIVERY,
);
check(
  "with the address",
  delivered.ok &&
    delivered.data.method === FulfilmentMethod.DELIVERY &&
    delivered.data.address.postcode === "BS1 4ND",
);

// The default on the column, the default on the form, and what every order
// before this feature was. A missing radio should not be a validation message
// about a control the shopper never knowingly used.
check(
  "a missing method falls back to delivery",
  (() => {
    const r = parseFulfilment(form(address()), true);
    return r.ok && r.data.method === FulfilmentMethod.DELIVERY;
  })(),
);
check(
  "so does an unrecognised one",
  (() => {
    const r = parseFulfilment(form([...address(), ["fulfilment", "TELEPORT"]]), true);
    return r.ok && r.data.method === FulfilmentMethod.DELIVERY;
  })(),
);
check(
  "an incomplete address is still refused",
  !parseFulfilment(form([["shippingName", "Sam Rivera"]]), true).ok,
);

console.log("\nA collection asks for who is coming, and nothing else");

const pickupForm = (extra: [string, string][] = []) =>
  form([
    ["fulfilment", FulfilmentMethod.PICKUP],
    ["pickupName", "Sam Rivera"],
    ...extra,
  ]);

const collected = parseFulfilment(pickupForm(), true);
check("it parses", collected.ok);
check(
  "as a collection",
  collected.ok && collected.data.method === FulfilmentMethod.PICKUP,
);
check(
  "with the collector's name",
  collected.ok &&
    collected.data.method === FulfilmentMethod.PICKUP &&
    collected.data.contact.name === "Sam Rivera",
);
check(
  "no phone is fine",
  collected.ok &&
    collected.data.method === FulfilmentMethod.PICKUP &&
    collected.data.contact.phone === null,
);
check(
  "a phone comes through when given",
  (() => {
    const r = parseFulfilment(pickupForm([["pickupPhone", "+44 7911 123456"]]), true);
    return r.ok && r.data.method === FulfilmentMethod.PICKUP && r.data.contact.phone === "+44 7911 123456";
  })(),
);

// The whole reason the method is read first: the address fields are unmounted
// when collection is chosen, so validating them regardless would make a
// collection order impossible to place.
check(
  "no postcode is demanded",
  parseFulfilment(pickupForm(), true).ok,
);
check(
  "somebody still has to be named",
  !parseFulfilment(form([["fulfilment", FulfilmentMethod.PICKUP]]), true).ok,
);
check(
  "and whitespace is not a name",
  !parseFulfilment(
    form([["fulfilment", FulfilmentMethod.PICKUP], ["pickupName", "   "]]),
    true,
  ).ok,
);

console.log("\nCollection cannot be claimed at a shop that does not offer it");

// Refused rather than downgraded to delivery: downgrading would post the order
// to an address the shopper deliberately declined to give.
const unoffered = parseFulfilment(pickupForm(), false);
check("it is refused", !unoffered.ok);
check(
  "under a key the form can show",
  !unoffered.ok && Boolean(unoffered.errors.fulfilment),
);
check(
  "while delivery still works at the same shop",
  parseFulfilment(form(address()), false).ok,
);

console.log("\nCollection is only offered when it can actually happen");

check(
  "switched on with an address",
  pickupAvailable({ pickupEnabled: true, pickupAddress: "4 Market Square" }),
);
check(
  "switched off is not offered",
  !pickupAvailable({ pickupEnabled: false, pickupAddress: "4 Market Square" }),
);
// "Collect in store" naming no store is an option nobody can act on, and they
// only find that out after committing to it.
check(
  "on with no address is not offered",
  !pickupAvailable({ pickupEnabled: true, pickupAddress: "" }),
);
check(
  "nor with only whitespace",
  !pickupAvailable({ pickupEnabled: true, pickupAddress: "   " }),
);

console.log("\nThe wording follows the method");

const delivery = fulfilmentLabels(FulfilmentMethod.DELIVERY);
const pickup = fulfilmentLabels(FulfilmentMethod.PICKUP);

check("delivery is still called Shipped", delivery.shipped === "Shipped");
// A customer told their collection order has shipped goes looking for a
// tracking number that will never exist.
check("collection is called Collected", pickup.shipped === "Collected");
check("the charge row is renamed too", pickup.charge !== delivery.charge);
check("so is the admin's button", pickup.markShipped !== delivery.markShipped);
check("and the destination heading", pickup.destination !== delivery.destination);
check(
  "every label is filled in",
  [delivery, pickup].every((labels) =>
    Object.values(labels).every((value) => Boolean(value)),
  ),
);

console.log("\nThe method is narrowed safely");

check("a real member is recognised", isFulfilmentMethod("PICKUP"));
check("an invented one is not", !isFulfilmentMethod("DRONE"));
// `Object.hasOwn` rather than `in`, so nothing inherited from Object.prototype
// can be mistaken for a method.
check("and neither is a prototype key", !isFulfilmentMethod("toString"));

console.log(
  failures === 0
    ? "\nAll checks passed.\n"
    : `\n${failures} check${failures === 1 ? "" : "s"} failed.\n`,
);

process.exit(failures === 0 ? 0 : 1);
