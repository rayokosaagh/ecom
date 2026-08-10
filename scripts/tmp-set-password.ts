import "dotenv/config";
import { Client } from "pg";
import { hashPassword, verifyPassword } from "../src/lib/auth/password";

const EMAIL = "admin@ecom.local";
const PASSWORD = "admin123";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const { rows } = await client.query(
    `update "User" set "passwordHash" = $1 where email = $2 returning email, role, "passwordHash"`,
    [await hashPassword(PASSWORD), EMAIL],
  );

  if (!rows.length) {
    console.log(`no such user: ${EMAIL}`);
  } else {
    const [row] = rows;
    // Read the stored hash back rather than trusting the write.
    console.log(`updated ${row.email} (${row.role})`);
    console.log(`verify "${PASSWORD}" ->`, await verifyPassword(PASSWORD, row.passwordHash));
  }

  await client.end();
}
main();
