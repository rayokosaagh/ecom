import {
  RESET_REQUEST_COOLDOWN_MS,
  RESET_TOKEN_TTL_MS,
  hashResetToken,
  judgeResetToken,
  mayIssueResetToken,
  newResetToken,
} from "../src/lib/auth/reset-rules";
import { parsePasswordReset, parseResetRequest } from "../src/lib/auth/validation";
import { PASSWORD_MIN_LENGTH } from "../src/lib/auth/validation";

/**
 * Checks for password reset.
 *
 * Same reasoning as `check:svg` and `check:review-media`: this is the flow that
 * hands out control of an account, and a boundary with no executable statement
 * of what it allows is one edit away from allowing more. Four things are being
 * defended.
 *
 * The token must not be recoverable from what is stored, so a database read
 * cannot be turned into a working link. A link must die on time and on use.
 * The cooldown must actually bite, or the form is a mail cannon. And the
 * failure messages must not tell anyone which tokens ever existed.
 *
 *   npm run check:password-reset
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

const NOW = new Date("2026-01-01T12:00:00.000Z");
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);

console.log("\nTokens are unguessable and unrecoverable");

const token = newResetToken();
const other = newResetToken();

check("two tokens differ", token !== other);
check("base64url only — safe in a query string", /^[A-Za-z0-9_-]+$/.test(token), token);
check("at least 32 bytes of randomness", Buffer.from(token, "base64url").length >= 32);
check("hash is hex SHA-256", /^[0-9a-f]{64}$/.test(hashResetToken(token)));
check("hashing is stable", hashResetToken(token) === hashResetToken(token));
check("different tokens hash differently", hashResetToken(token) !== hashResetToken(other));
check(
  "the token cannot be read back out of its hash",
  !hashResetToken(token).includes(token.toLowerCase()),
);

console.log("\nA link dies on time, and on use");

const live = { expiresAt: at(RESET_TOKEN_TTL_MS), usedAt: null };

check("a fresh token is good", judgeResetToken(live, NOW).ok);
check(
  "still good one millisecond before it expires",
  judgeResetToken(live, at(RESET_TOKEN_TTL_MS - 1)).ok,
);
check(
  "dead exactly on the expiry instant",
  !judgeResetToken(live, at(RESET_TOKEN_TTL_MS)).ok,
);
check("dead long after", !judgeResetToken(live, at(RESET_TOKEN_TTL_MS * 10)).ok);
check(
  "a spent token is refused even while unexpired",
  !judgeResetToken({ expiresAt: at(RESET_TOKEN_TTL_MS), usedAt: NOW }, NOW).ok,
);
check("an unknown token is refused", !judgeResetToken(null, NOW).ok);

console.log("\nFailures must not say which tokens ever existed");

const unknown = judgeResetToken(null, NOW);
const expired = judgeResetToken({ expiresAt: at(-1), usedAt: null }, NOW);

check(
  "unknown and expired give the same reason",
  !unknown.ok && !expired.ok && unknown.reason === expired.reason,
  !unknown.ok && !expired.ok ? `${unknown.reason} / ${expired.reason}` : "",
);

console.log("\nThe cooldown bites");

check("no previous request — allowed", mayIssueResetToken(null, NOW));
check(
  "a second request straight away is declined",
  !mayIssueResetToken(NOW, NOW),
);
check(
  "declined one millisecond early",
  !mayIssueResetToken(NOW, at(RESET_REQUEST_COOLDOWN_MS - 1)),
);
check(
  "allowed once the cooldown has run",
  mayIssueResetToken(NOW, at(RESET_REQUEST_COOLDOWN_MS)),
);

console.log("\nThe request form");

function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

const lowercased = parseResetRequest(form([["email", "  Sam@Example.COM  "]]));
check(
  "an address is trimmed and lowercased",
  lowercased.ok && lowercased.data.email === "sam@example.com",
  lowercased.ok ? lowercased.data.email : "",
);
check("a missing address is refused", !parseResetRequest(form([])).ok);
check(
  "a malformed address is refused",
  !parseResetRequest(form([["email", "not-an-address"]])).ok,
);

console.log("\nThe new-password form");

const short = "a".repeat(PASSWORD_MIN_LENGTH - 1);
const good = "a".repeat(PASSWORD_MIN_LENGTH);

const accepted = parsePasswordReset(
  form([
    ["token", "abc"],
    ["password", good],
    ["confirmPassword", good],
  ]),
);
check(
  "a valid pair is accepted, token intact",
  accepted.ok && accepted.data.password === good && accepted.data.token === "abc",
);

check(
  `shorter than ${PASSWORD_MIN_LENGTH} is refused`,
  !parsePasswordReset(
    form([
      ["token", "abc"],
      ["password", short],
      ["confirmPassword", short],
    ]),
  ).ok,
);

check(
  "a mismatched confirmation is refused",
  !parsePasswordReset(
    form([
      ["token", "abc"],
      ["password", good],
      ["confirmPassword", `${good}x`],
    ]),
  ).ok,
);

check(
  "an empty password is refused",
  !parsePasswordReset(
    form([
      ["token", "abc"],
      ["password", ""],
      ["confirmPassword", ""],
    ]),
  ).ok,
);

// A missing token still parses: the password is validated first on purpose, so
// a typo comes back as a field error rather than sending someone to request a
// fresh link. Whether the token is real is decided in `lib/auth/reset`.
const noToken = parsePasswordReset(
  form([
    ["password", good],
    ["confirmPassword", good],
  ]),
);
check("a missing token parses to empty, not an error", noToken.ok && noToken.data.token === "");

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
