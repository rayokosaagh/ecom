import "dotenv/config";

import { Client } from "pg";

/**
 * Is the database reachable, and which one is it?
 *
 * This replaced `prisma dev --name ecom-db`. There is no local database process
 * to start any more — PostgreSQL runs as a service and is up before the shell
 * is — so the useful thing for `npm run db` to do is answer the question that
 * used to be answered by watching that command's output: am I pointed at the
 * right server, and is it there?
 *
 * Written against `pg` rather than shelling out to `pg_isready` so it needs
 * nothing on PATH: the Windows installer does not add PostgreSQL's bin
 * directory, and a hard-coded `C:\Program Files\...` in package.json would not
 * survive anyone else checking this project out.
 */
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.");
  process.exit(1);
}

// Never print the password back out, whatever else goes wrong below.
const redacted = connectionString.replace(/(:\/\/[^:]+:)[^@]*@/, "$1***@");

async function main() {
  const client = new Client({ connectionString, connectionTimeoutMillis: 5000 });

  try {
    await client.connect();
  } catch (error) {
    const { code, message } = error as { code?: string; message?: string };
    console.error(`✖ Cannot reach the database.\n  ${redacted}\n  ${code ?? ""} ${message ?? ""}`);
    console.error(
      "\n  If this is a fresh machine:\n" +
        "    winget install PostgreSQL.PostgreSQL.17\n" +
        '    psql -U postgres -c "CREATE DATABASE ecom"\n' +
        "    npm run db:push && npm run db:seed",
    );
    process.exitCode = 1;
    return;
  }

  try {
    const { rows } = await client.query<{ db: string; version: string }>(
      "select current_database() as db, current_setting('server_version') as version",
    );
    const tables = await client.query<{ n: string }>(
      "select count(*)::text as n from information_schema.tables where table_schema = 'public'",
    );
    console.log(`✔ PostgreSQL ${rows[0].version} — database "${rows[0].db}"`);
    console.log(`  ${redacted}`);
    console.log(`  ${tables.rows[0].n} tables in public`);
  } finally {
    await client.end().catch(() => {});
  }
}

void main();
