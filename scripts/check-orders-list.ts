import { OrderStatus } from "../src/generated/prisma/enums";
import {
  defaultSort,
  parsePerPage,
  parseSort,
  parseStatus,
  parseView,
  resolveDateWindow,
} from "../src/lib/orders/list-params";
import { formatOrderDate, pendingAge } from "../src/lib/orders/when";
import { orderReference } from "../src/lib/orders/reference";
import { nextStatus } from "../src/lib/orders/transitions";
import { ordersToCsv } from "../src/lib/orders/csv";

/**
 * Checks for the admin order list.
 *
 * Everything here is pure — the parsers that turn a URL into a query, the two
 * date formats, the pending clock, and the CSV writer. None of it needs a
 * database, and all of it is the kind of code that is wrong quietly: a date
 * window off by a timezone, a sort that is not a total order, a spreadsheet
 * cell that turns out to be a formula.
 *
 *   npm run check:orders-list
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

/* -------------------------------------------------------------------------- */
console.log("\nParams refuse anything they did not offer");

check("a real status is kept", parseStatus("PAID") === OrderStatus.PAID);
check("a made-up status is dropped", parseStatus("REFUNDED") === undefined);
check("lower case is not a status", parseStatus("paid") === undefined);
check("a page size off the menu falls back to 50", parsePerPage("37") === 50);
check("a page size on the menu is kept", parsePerPage("100") === 100);
check("the view defaults to the table", parseView(undefined) === "table");
check("cards are reachable", parseView("cards") === "cards");
check("an unknown view is not", parseView("gallery") === "table");

/* -------------------------------------------------------------------------- */
console.log("\nPending sorts oldest-first by default, everything else newest");

check("pending defaults to oldest", defaultSort(OrderStatus.PENDING) === "oldest");
check("the All tab defaults to newest", defaultSort(undefined) === "newest");
check("delivered defaults to newest", defaultSort(OrderStatus.DELIVERED) === "newest");
check(
  "an explicit sort still wins on pending",
  parseSort("highest", OrderStatus.PENDING) === "highest",
);
check(
  "a junk sort falls back to the tab's default, not to newest",
  parseSort("sideways", OrderStatus.PENDING) === "oldest",
);

/* -------------------------------------------------------------------------- */
console.log("\nDate windows are local days");

// 2026-08-11 14:30 local, whatever local is on the machine running this.
const now = new Date(2026, 7, 11, 14, 30);

const today = resolveDateWindow("today", undefined, undefined, now);
check("today starts at local midnight", today.from?.getHours() === 0);
check("today starts today", today.from?.getDate() === 11);
check("today has no upper bound", today.to === undefined);

const week = resolveDateWindow("7d", undefined, undefined, now);
check(
  "last 7 days includes today, so it reaches back six",
  week.from?.getDate() === 5 && week.from?.getMonth() === 7,
  `got ${week.from?.toDateString()}`,
);

const month = resolveDateWindow("month", undefined, undefined, now);
check("this month starts on the 1st", month.from?.getDate() === 1);
check("this month is this month", month.from?.getMonth() === 7);

const custom = resolveDateWindow("custom", "2026-08-01", "2026-08-03", now);
check("a custom start is that local day at midnight", custom.from?.getDate() === 1);
check(
  "a custom end is inclusive — the last instant of the day",
  custom.to?.getDate() === 3 && custom.to?.getHours() === 23 && custom.to?.getMinutes() === 59,
  `got ${custom.to?.toString()}`,
);
check(
  "a custom day does not slide into the previous one",
  custom.from?.getMonth() === 7,
  `got ${custom.from?.toDateString()}`,
);

const backwards = resolveDateWindow("custom", "2026-08-09", "2026-08-02", now);
check(
  "a backwards range is swapped rather than matching nothing",
  backwards.from!.getDate() === 2 && backwards.to!.getDate() === 9,
);

check(
  "no range key means no window at all",
  Object.keys(resolveDateWindow(undefined, "2026-08-01", "2026-08-03", now)).length === 0,
);

/* -------------------------------------------------------------------------- */
console.log("\nDates read as elapsed time for a day, then as a date");

const ago = (ms: number) => new Date(now.getTime() - ms);
const MIN = 60_000;
const HOUR = 60 * MIN;

check("seconds old is 'Just now'", formatOrderDate(ago(30_000), now).text === "Just now");
check("one minute is singular", formatOrderDate(ago(MIN), now).text === "1 minute ago");
check("forty minutes is plural", formatOrderDate(ago(40 * MIN), now).text === "40 minutes ago");
check("two hours reads in hours", formatOrderDate(ago(2 * HOUR), now).text === "2 hours ago");
check(
  "23 hours is still relative",
  formatOrderDate(ago(23 * HOUR), now).text === "23 hours ago",
);
check(
  "25 hours has crossed over to a date",
  /2026/.test(formatOrderDate(ago(25 * HOUR), now).text),
  formatOrderDate(ago(25 * HOUR), now).text,
);
check(
  "the exact timestamp survives in the title either way",
  formatOrderDate(ago(2 * HOUR), now).title.includes("2026"),
);
check(
  "a future timestamp does not read as negative",
  formatOrderDate(new Date(now.getTime() + 5000), now).text === "Just now",
);

/* -------------------------------------------------------------------------- */
console.log("\nPending age flags only what is late");

check("23 hours is not overdue", pendingAge(ago(23 * HOUR), now).overdue === false);
check("24 hours is overdue", pendingAge(ago(24 * HOUR), now).overdue === true);
check("30 hours stays in hours", pendingAge(ago(30 * HOUR), now).short === "30h");
check("47 hours stays in hours", pendingAge(ago(47 * HOUR), now).short === "47h");
check("48 hours becomes days", pendingAge(ago(48 * HOUR), now).short === "2d");
check("three days shows as days", pendingAge(ago(72 * HOUR), now).short === "3d");
check(
  "the long form spells out the same number",
  pendingAge(ago(30 * HOUR), now).long === "Pending for 30 hours" &&
    pendingAge(ago(72 * HOUR), now).long === "Pending for 3 days",
);
check("a negative age clamps to zero", pendingAge(new Date(now.getTime() + HOUR), now).hours === 0);

/* -------------------------------------------------------------------------- */
console.log("\nThe reference an admin reads is one they can search for");

// The admin list matches ids with `contains`, so the only thing that has to
// hold is that the reference is a substring of the id it was built from. This
// guarded a real bug: the reference is the *last* eight characters, the search
// matched the *first*, and typing the reference printed on the row returned
// nothing.
for (const id of [
  "clx0000000000000000000001",
  "cm4k91k90lxz0000abcd1234",
  "cbcdefghijklmnopqrstuvwx",
]) {
  const reference = orderReference(id);
  check(
    `${reference} is findable inside its own id`,
    id.toUpperCase().includes(reference),
    `id=${id} reference=${reference}`,
  );
}

check("the reference is the tail", orderReference("abcdefghijklmnop") === "IJKLMNOP");
check(
  "a prefix match could not have found it — the bug this replaced",
  !"abcdefghijklmnop".toUpperCase().startsWith(orderReference("abcdefghijklmnop")),
);
check(
  "the reference is exactly eight characters",
  [8, 8, 8].every(
    (n, index) =>
      orderReference(["clx000000000000000000abc", "a".repeat(30), "short1234"][index]).length === n,
  ),
);

/* -------------------------------------------------------------------------- */
console.log("\nThe forward move matches the transition table");

check("pending advances to paid, not shipped", nextStatus(OrderStatus.PENDING) === OrderStatus.PAID);
check("paid advances to shipped", nextStatus(OrderStatus.PAID) === OrderStatus.SHIPPED);
check("shipped advances to delivered", nextStatus(OrderStatus.SHIPPED) === OrderStatus.DELIVERED);
check("delivered is terminal", nextStatus(OrderStatus.DELIVERED) === null);
check("cancelled is terminal", nextStatus(OrderStatus.CANCELLED) === null);
check(
  "cancelling is never offered as progress",
  [OrderStatus.PENDING, OrderStatus.PAID, OrderStatus.SHIPPED].every(
    (status) => nextStatus(status) !== OrderStatus.CANCELLED,
  ),
);

/* -------------------------------------------------------------------------- */
console.log("\nThe CSV is escaped, and inert in a spreadsheet");

const row = (over: Partial<Parameters<typeof ordersToCsv>[0][number]>) => ({
  id: "clx0000000000000000000001",
  status: OrderStatus.PAID,
  totalCents: 123_456,
  createdAt: new Date(Date.UTC(2026, 7, 11, 9, 0, 0)),
  shippingName: "Asha Gurung",
  shippingCity: "Kathmandu",
  shippingCountry: "NP",
  fulfilment: "DELIVERY",
  paymentMethod: "KHALTI",
  user: { name: "Asha", email: "asha@example.com" },
  _count: { items: 2 },
  ...over,
}) as Parameters<typeof ordersToCsv>[0][number];

const header = ordersToCsv([]).split("\r\n")[0];
check("an empty export still has a header", header.startsWith("Reference,Order ID,Placed"));

const plain = ordersToCsv([row({})]).split("\r\n")[1];
check("the amount is a bare number in major units", plain.includes("1234.56"), plain);
check("the date is ISO 8601", plain.includes("2026-08-11T09:00:00.000Z"), plain);
check("the reference is the short form", plain.startsWith("00000001"), plain);

const comma = ordersToCsv([row({ shippingName: "Gurung, Asha" })]).split("\r\n")[1];
check("a comma is quoted", comma.includes('"Gurung, Asha"'), comma);

const quoted = ordersToCsv([row({ shippingName: 'Asha "Ash" G' })]).split("\r\n")[1];
check("a quote is doubled and wrapped", quoted.includes('"Asha ""Ash"" G"'), quoted);

const newline = ordersToCsv([row({ shippingCity: "Line1\nLine2" })]).split("\r\n")[1];
check("a newline is quoted rather than breaking the row", newline.includes('"Line1'), newline);

for (const dangerous of ["=HYPERLINK(1)", "+1+1", "-2+3", "@SUM(A1)"]) {
  const cell = ordersToCsv([row({ shippingName: dangerous })]).split("\r\n")[1];
  check(
    `a cell starting ${dangerous[0]} is defused`,
    cell.includes(`'${dangerous}`) || cell.includes(`"'${dangerous}`),
    cell,
  );
}

check(
  "a name that is merely negative-looking is still readable",
  ordersToCsv([row({ shippingName: "-2+3" })]).split("\r\n")[1].includes("'-2+3"),
);

const lines = ordersToCsv([row({}), row({})]).split("\r\n");
check("rows are CRLF separated and terminated", lines.length === 4 && lines[3] === "");

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
