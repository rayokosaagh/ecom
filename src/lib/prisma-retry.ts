/**
 * Retry policy for reads that fail on a dead pooled connection.
 *
 * Kept apart from `lib/prisma` so it can be exercised without constructing a
 * client: importing that module opens a connection pool as a side effect, and
 * a policy this fiddly deserves tests that do not need a database running.
 */

/**
 * Errors that mean "the pooled socket was already dead", as opposed to
 * anything the query itself did wrong.
 *
 * node-postgres does not validate a pooled client before handing it out, so a
 * connection the server closed underneath us surfaces here on the next use —
 * and because the socket is gone, the statement was never sent.
 *
 * `ECONNREFUSED` is deliberately absent: a refused connection means nothing is
 * listening, and retrying that is just a slower way to fail.
 */
const DEAD_CONNECTION =
  /Server has closed the connection|Connection terminated|ConnectionClosed|ECONNRESET|EPIPE|Client has encountered a connection error/i;

/**
 * Prisma's own code for "the server closed the connection".
 *
 * Matched alongside the text because the *driver adapter* raises
 * `DriverAdapterError: ConnectionClosed` — two words, no spaces — while the
 * client wraps it in a P1017 whose message reads "Server has closed the
 * connection." A predicate that only knew the prose form saw the raw adapter
 * error, decided it was not a connection failure, and rethrew: the retry and
 * the pool recycling below were both unreachable in the one case they exist
 * for. Matching the code as well means neither wording can hide it.
 */
const DEAD_CONNECTION_CODES = new Set(["P1017", "P1001", "P1002"]);

/** How far up a `cause` chain to look before giving up. */
const MAX_CAUSE_DEPTH = 5;

/** Operations that are safe to run twice. */
const READ_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

/**
 * Connections the pool may hold.
 *
 * Exported because the retry count is derived from it — the two have to move
 * together, for the reason set out on `MAX_ATTEMPTS`.
 */
export const POOL_MAX = 5;

/**
 * One attempt per pooled connection, plus the first.
 *
 * This is the fix for the case a single retry could never handle. When the
 * database restarts, every connection the pool is holding is stale — up to
 * `POOL_MAX` of them. A failed query causes node-postgres to discard *that*
 * client, so each attempt drains exactly one dead socket. Retrying once
 * therefore just draws a second corpse from the same pool and gives up, which
 * is precisely what used to happen after every restart.
 */
const MAX_ATTEMPTS = POOL_MAX + 1;

/**
 * Linear backoff between attempts: 20ms, 40ms, 60ms…
 *
 * Small on purpose. The pause is not there to wait out a recovering server —
 * it is there to let node-postgres finish evicting the client that just
 * failed before the next attempt asks for one.
 */
const BACKOFF_MS = 20;

/**
 * Ceiling on the whole sequence.
 *
 * Without it a hung server turns this into a much slower failure than it
 * replaced: `connectionTimeoutMillis` is 10s, and "Connection terminated"
 * matches the pattern above, so six attempts could hold a request for a
 * minute. Past this point the read has already failed as far as the visitor is
 * concerned.
 */
const DEADLINE_MS = 2_000;

/**
 * Exported for tests: this predicate is the whole of the retry decision.
 *
 * Walks the `cause` chain as well as the top-level error, because Prisma wraps
 * the driver's failure rather than replacing it — and which of the two layers
 * a caller sees depends on where in the stack it caught.
 */
export function isDeadConnection(error: unknown): boolean {
  let current: unknown = error;

  for (let depth = 0; current != null && depth < MAX_CAUSE_DEPTH; depth++) {
    if (typeof current === "object") {
      const code = (current as { code?: unknown }).code;
      if (typeof code === "string" && DEAD_CONNECTION_CODES.has(code)) return true;
    }

    const message = current instanceof Error ? current.message : String(current);
    if (DEAD_CONNECTION.test(message)) return true;

    current = current instanceof Error ? current.cause : undefined;
  }

  return false;
}

export function isRetryableOperation(operation: string): boolean {
  return READ_OPERATIONS.has(operation);
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Run a read, retrying while the failure is a dead pooled socket.
 *
 * Reads only. A write that failed *after* reaching the server would be applied
 * twice by a blind retry, and the error alone does not distinguish "never
 * sent" from "sent but no reply" — so writes are left to surface.
 *
 * Anything that is not a connection death is rethrown untouched on the first
 * attempt, so a genuine query error still fails fast.
 */
export async function retryDeadConnectionRead<T>(
  operation: string,
  run: () => Promise<T>,
  /** Overridable so tests do not have to spend real seconds proving a limit. */
  limits: { maxAttempts?: number; backoffMs?: number; deadlineMs?: number } = {},
): Promise<T> {
  const maxAttempts = limits.maxAttempts ?? MAX_ATTEMPTS;
  const backoffMs = limits.backoffMs ?? BACKOFF_MS;
  const deadlineMs = limits.deadlineMs ?? DEADLINE_MS;

  const startedAt = Date.now();

  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      const retryable =
        isRetryableOperation(operation) &&
        isDeadConnection(error) &&
        attempt < maxAttempts &&
        Date.now() - startedAt < deadlineMs;

      if (!retryable) throw error;

      await sleep(backoffMs * attempt);
    }
  }
}
