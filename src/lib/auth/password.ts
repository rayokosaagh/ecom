import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * Hash a plaintext password with scrypt. Uses node:crypto so there is no
 * native dependency to rebuild per platform, unlike bcrypt.
 *
 * Format: `scrypt$<salt-hex>$<derived-key-hex>`
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/**
 * Constant-time verification. Returns false rather than throwing on a
 * malformed stored hash so a corrupt row cannot 500 the login route.
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const [scheme, saltHex, keyHex] = storedHash.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;

  const expected = Buffer.from(keyHex, "hex");
  if (expected.length !== KEY_LENGTH) return false;

  const derived = await scrypt(password, Buffer.from(saltHex, "hex"), KEY_LENGTH);
  return timingSafeEqual(derived, expected);
}
