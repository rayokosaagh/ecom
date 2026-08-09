/**
 * Small hand-rolled validators. Deliberately dependency-free — the rules here
 * are simple enough that pulling in a schema library would not earn its weight.
 */

export type Validated<T> =
  | { ok: true; data: T }
  | { ok: false; errors: Record<string, string> };

export const PASSWORD_MIN_LENGTH = 8;

// Intentionally permissive: the only reliable proof an address exists is
// sending mail to it. This just catches obvious typos.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseCredentials(
  raw: unknown,
): Validated<{ email: string; password: string }> {
  const input = (raw ?? {}) as Record<string, unknown>;
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";

  const errors: Record<string, string> = {};
  if (!email) errors.email = "Email is required";
  else if (!EMAIL_PATTERN.test(email)) errors.email = "Enter a valid email address";
  if (!password) errors.password = "Password is required";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { email, password } };
}

export function parseRegistration(
  formData: FormData,
): Validated<{ name: string; email: string; password: string }> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const errors: Record<string, string> = {};

  if (!name) errors.name = "Name is required";
  else if (name.length > 80) errors.name = "Name must be 80 characters or fewer";

  if (!email) errors.email = "Email is required";
  else if (!EMAIL_PATTERN.test(email)) errors.email = "Enter a valid email address";

  if (!password) errors.password = "Password is required";
  else if (password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }

  if (password !== confirmPassword) errors.confirmPassword = "Passwords do not match";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { name, email, password } };
}

/**
 * The address on the "forgot password" form.
 *
 * Lowercased to match how `parseRegistration` and `parseCredentials` store and
 * look up addresses — an account created as `Sam@Example.com` has to be
 * reachable by someone who types it back in any casing.
 */
export function parseResetRequest(formData: FormData): Validated<{ email: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email) return { ok: false, errors: { email: "Email is required" } };
  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, errors: { email: "Enter a valid email address" } };
  }

  return { ok: true, data: { email } };
}

/**
 * The new password, plus the token that authorises setting it.
 *
 * The token is only checked for presence here; whether it is live, spent or
 * fabricated is `lib/auth/reset`'s decision, and one it makes against the
 * database. Validating the *password* first is deliberate all the same — a
 * mistyped confirmation should come back as a field error with the token
 * intact, not burn the link.
 */
export function parsePasswordReset(
  formData: FormData,
): Validated<{ token: string; password: string }> {
  const token = String(formData.get("token") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const errors: Record<string, string> = {};

  if (!password) errors.password = "Enter a new password";
  else if (password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }

  if (password !== confirmPassword) errors.confirmPassword = "Passwords do not match";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { token, password } };
}
