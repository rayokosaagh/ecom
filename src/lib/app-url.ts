import "server-only";

/**
 * The origin this app is reached at, for links that leave the browser.
 *
 * Read from configuration and *never* from the request's `Host` header, which
 * is the part that matters. A reset link built from `Host` is the classic host
 * header poisoning bug: an attacker asks for a reset of someone else's address
 * with `Host: evil.example`, the victim gets a genuine mail from the real shop
 * containing a link to the attacker's server, and clicking it hands over a
 * working token. Anything a mail client will render has to be built from a
 * value the request cannot influence.
 *
 * In-page navigation does not need this — a relative href is already correct,
 * and is what the rest of the app uses.
 */
const FALLBACK = "http://localhost:3000";

export function appUrl(path = "/"): string {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, "");

  if (!configured && process.env.NODE_ENV === "production") {
    // Loud, because the alternative is emailing customers a localhost link.
    console.error(
      "[app-url] APP_URL is not set — outbound links will point at " +
        `${FALLBACK}, which is wrong outside development.`,
    );
  }

  const base = configured || FALLBACK;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
