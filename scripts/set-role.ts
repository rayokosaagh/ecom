import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { Role } from "../src/generated/prisma/enums";

/**
 * Promote or demote a user.
 *
 * Public signup only ever grants USER, and there is intentionally no UI for
 * self-promotion, so changing a role is a deliberate out-of-band action.
 *
 *   npm run set-role -- user@example.com ADMIN
 *   npm run set-role -- user@example.com USER
 */
const [emailArg, roleArg] = process.argv.slice(2);

function usage(message: string): never {
  console.error(`${message}\n\nUsage: npm run set-role -- <email> <ADMIN|USER>`);
  process.exit(1);
}

type RoleValue = (typeof Role)[keyof typeof Role];

if (!emailArg) usage("Missing email.");
if (roleArg !== Role.ADMIN && roleArg !== Role.USER) {
  usage(`Invalid role ${roleArg ? `"${roleArg}"` : ""}. Expected ADMIN or USER.`);
}
// Narrowing above leaves `roleArg` as string, so restate the checked type.
const role: RoleValue = roleArg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) usage("DATABASE_URL is not set. Start the database with `npm run db`.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const email = emailArg.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) usage(`No user found with email "${email}".`);

  if (existing.role === role) {
    console.log(`${email} is already ${role}. Nothing to do.`);
    return;
  }

  const updated = await prisma.user.update({
    where: { email },
    data: { role },
    select: { email: true, role: true },
  });

  console.log(`${updated.email}: ${existing.role} -> ${updated.role}`);
  // The role lives in the session JWT until it expires, so an already
  // signed-in user keeps their old role in the UI until they sign in again.
  // Admin-only pages re-check the database, so access is correct immediately.
  console.log("They must sign out and back in for the change to show in the UI.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
