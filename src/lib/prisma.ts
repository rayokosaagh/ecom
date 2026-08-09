import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import {
  POOL_MAX,
  isDeadConnection,
  retryDeadConnectionRead,
} from "@/lib/prisma-retry";

// Prisma 7 requires a driver adapter rather than a bundled query engine.
function build() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Start the database with `npm run db`.");
  }

  const pool = new Pool({
    connectionString,
    // The local Prisma Postgres server (PGlite) drops idle connections, and
    // node-postgres does not validate a pooled client before handing it out —
    // so a stale one surfaces as "Server has closed the connection".
    // Retiring our own idle clients first means the pool rarely holds a
    // connection long enough for the server to close it underneath us.
    //
    // The size is shared with the retry policy: a transient stale socket is
    // drained one attempt per connection, so the two must agree.
    max: POOL_MAX,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
    // Hard cap on any single connection's life, as a backstop.
    maxLifetimeSeconds: 60,
  });

  // An idle client that dies in the background emits on the pool, not on any
  // query. Without a listener Node treats it as an unhandled 'error' event and
  // takes the process down — which is how a dropped connection could turn into
  // a dead dev server rather than one failed request.
  pool.on("error", (error) => {
    if (isDeadConnection(error)) return; // Expected; the pool discards it.
    console.error("[prisma] idle client error:", error);
  });

  const client = new PrismaClient({ adapter: new PrismaPg(pool) }).$extends({
    query: {
      $allOperations({ operation, args, query }) {
        return retryDeadConnectionRead(operation, () => query(args)).catch(
          (error: unknown) => {
            // Retries exhausted and the connection is still dead: not one
            // stale socket but a pool full of them, which cannot heal itself.
            if (isDeadConnection(error)) recycle(pool);
            throw error;
          },
        );
      },
    },
  });

  return { client, pool };
}

type Managed = ReturnType<typeof build>;

/**
 * Held on `globalThis` for two reasons.
 *
 * The original one: hot reloads re-evaluate this module, and building a new
 * pool each time exhausts the local server's connection slots.
 *
 * The second is `recycle` below — a swap has to be visible to every module
 * that already imported `prisma`, so the binding they hold cannot be the
 * client itself.
 */
const globalForPrisma = globalThis as unknown as {
  prismaManaged?: Managed;
  prismaRecycledAt?: number;
};

function current(): Managed {
  globalForPrisma.prismaManaged ??= build();
  return globalForPrisma.prismaManaged;
}

/**
 * Shortest gap between two rebuilds.
 *
 * This is the guard rail, not a tuning knob. A page render fires several
 * queries at once, so a dead pool produces a burst of simultaneous failures —
 * and without a cooldown each one would build its own replacement. That is how
 * a recovery mechanism turns into a connection leak: the local server accepts
 * about ten connections, a pool holds five, and two spare pools are enough to
 * make every *new* connection fail too. The symptom then looks exactly like
 * the original fault, which is what made it so hard to see.
 */
const RECYCLE_COOLDOWN_MS = 5_000;

/**
 * Throw away the client and its pool so the next query builds a fresh one.
 *
 * Retrying cannot fix a restarted database: every socket in the pool points at
 * a process that no longer exists, and node-postgres does not evict a client
 * when a query fails on it, so the pool stays poisoned until it is replaced.
 *
 * `pool.end()` is the part that matters. Dropping the reference alone leaves
 * the sockets open and the server's slots taken; ending it is what actually
 * gives them back.
 *
 * @param source The pool that failed. A request holding an older pool must not
 *   discard the replacement someone else has already built.
 */
function recycle(source: Pool): void {
  const managed = globalForPrisma.prismaManaged;
  if (!managed || managed.pool !== source) return;

  const now = Date.now();
  const last = globalForPrisma.prismaRecycledAt ?? 0;
  if (now - last < RECYCLE_COOLDOWN_MS) return;
  globalForPrisma.prismaRecycledAt = now;

  globalForPrisma.prismaManaged = undefined;

  // Deferred and swallowed: this runs while a query on that pool is still
  // unwinding, and an error closing it would mask the real one.
  void Promise.resolve().then(() =>
    managed.pool.end().catch(() => {
      /* already gone */
    }),
  );
}

/**
 * The client every module imports.
 *
 * A proxy rather than the client itself, so `recycle` can replace what sits
 * behind it. Modules import this binding once at startup; without the
 * indirection they would hold the dead client forever.
 */
export const prisma = new Proxy({} as Managed["client"], {
  get(_target, property) {
    return Reflect.get(current().client, property);
  },
});
