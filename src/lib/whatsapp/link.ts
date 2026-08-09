/**
 * Building a WhatsApp click-to-chat link.
 *
 * Deliberately free of `server-only`, of any database access and of
 * `process.env`: this decides what a customer sends to the shop and where it
 * goes, and it is worth being able to exercise directly. The number is read
 * from configuration at the call site and passed in.
 *
 * The mechanism is `https://wa.me/<number>?text=<message>`, which opens the app
 * on a phone and WhatsApp Web on a desktop. No API key, no cost, no backend —
 * and no record of the conversation inside this app, which is the trade being
 * accepted. See the notes on each function for the parts that are easy to get
 * wrong.
 */

/** The click-to-chat host. `wa.me` is WhatsApp's own short domain for this. */
const WA_BASE = "https://wa.me";

/**
 * Shortest and longest a real international number can be, digits only.
 *
 * E.164 allows up to 15 digits including the country code, and no assignable
 * number is shorter than 7. Bounds rather than a pattern, because the shapes
 * vary by country far too much for a regex to be worth trusting.
 */
export const MIN_NUMBER_DIGITS = 7;
export const MAX_NUMBER_DIGITS = 15;

/**
 * What the shopper was looking at when they asked.
 *
 * Everything is optional so the same builder serves a product page, an order
 * page and a bare "ask us anything" button.
 */
export interface InquiryContext {
  /** Product name, when the question is about one. */
  productName?: string;
  /** Absolute URL of the thing being asked about — see `lib/app-url`. */
  url?: string;
  /**
   * Short order reference, e.g. "91K90LXZ" — the one `orderReference` makes.
   *
   * Deliberately the short form and never the full id, and never anything else
   * off the order. This text ends up in a URL, in the customer's WhatsApp
   * history and possibly in their clipboard; a reference is enough for an agent
   * to look the order up, and an address or an email in there is a leak with no
   * upside.
   */
  orderReference?: string;
}

/**
 * Reduce an operator-entered number to the digits `wa.me` expects.
 *
 * The gotcha this exists for: `wa.me` wants digits only, in full international
 * form, with no `+`, no spaces, no brackets and no dashes. A number stored the
 * way a human types it — `+1 (555) 123-4567` — produces a link that silently
 * opens WhatsApp on a "phone number shared via url is invalid" screen. It does
 * not error; it just fails in front of the customer.
 *
 * Returns null rather than a best guess when the result is not plausible, so a
 * misconfigured number hides the button instead of rendering a link that fails
 * in the customer's face.
 *
 * Two decisions worth stating rather than leaving to be inferred:
 *
 *   - A leading `00` is removed as well as a leading `+`. They mean the same
 *     thing — `0044…` and `+44…` are one number — and only the bare form works
 *     here. No country code begins with a zero, so a leading `00` is never
 *     anything else.
 *
 *   - A *national* number entered without a country code — `07911 123456` —
 *     is deliberately **not** repaired. Eleven digits is a perfectly plausible
 *     international number, so there is nothing to detect: the trunk prefix and
 *     a real leading digit are indistinguishable without knowing the country.
 *     The operator has to enter full international form, and the field's help
 *     text says so.
 */
export function normalizeWhatsappNumber(raw: string): string | null {
  const digitsOnly = raw.replace(/\D/g, "");

  // Stripped before measuring: the prefix is dialling instruction, not number,
  // and counting it would let a too-long number through.
  const bare = digitsOnly.startsWith("00") ? digitsOnly.slice(2) : digitsOnly;

  if (bare.length < MIN_NUMBER_DIGITS || bare.length > MAX_NUMBER_DIGITS) {
    return null;
  }

  return bare;
}

/**
 * Compose the message that arrives prefilled in the chat.
 *
 * Written as something a person would plausibly type, because that is what the
 * agent sees — a machine-shaped string of fields reads as spam and invites a
 * shorter reply.
 *
 * The URL goes last so it never interrupts the sentence, and everything is
 * plain text: `whatsappHref` owns the encoding, and doing it twice is what puts
 * `%2520` in the customer's message.
 *
 * What is *absent* is the point. Only the three fields on `InquiryContext` are
 * available, and widening it is how a shipping address ends up in a URL — see
 * the note on `orderReference`.
 */
export function inquiryMessage(context: InquiryContext): string {
  const { productName, orderReference, url } = context;

  const opening = productName
    ? `Hi! I have a question about ${productName}.`
    : orderReference
      ? "Hi! I have a question about my order."
      : "Hi! I have a question.";

  return [
    opening,
    // Quoted even when the opening already mentions the order, so an agent can
    // find it by eye without parsing the sentence.
    orderReference ? `Order ${orderReference}.` : null,
    url,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * The full href, or null when the number is unusable.
 *
 * Built with `URL`/`URLSearchParams` rather than string concatenation, and that
 * is the whole of the care needed here: an unencoded `&` starts a second query
 * parameter and silently truncates the customer's message at that point, while
 * a `#` drops everything after it. Letting the URL machinery encode means the
 * awkward characters — `&`, `#`, `%`, newlines, emoji — all survive, and it
 * happens exactly once because `inquiryMessage` returned plain text.
 */
export function whatsappHref(rawNumber: string, message: string): string | null {
  const number = normalizeWhatsappNumber(rawNumber);
  if (!number) return null;

  const url = new URL(`${WA_BASE}/${number}`);
  url.searchParams.set("text", message);
  return url.toString();
}
