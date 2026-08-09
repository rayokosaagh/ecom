import {
  POOL_MAX,
  isDeadConnection,
  isRetryableOperation,
  retryDeadConnectionRead,
} from "../src/lib/prisma-retry";

/**
 * Checks for the dead-connection retry policy.
 *
 *   npm run check:retry
 *
 * No database and no Prisma client: the policy takes a thunk, so a fake one
 * that fails on demand exercises it exactly. That is the reason it lives in
 * its own module — importing `lib/prisma` would open a real pool.
 *
 * The case that matters is a database restart, which leaves every pooled
 * connection stale at once. A single retry could not survive that, and it is
 * not reproducible by hand often enough to be caught any other way.
 */

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  ok    ${label}`);
    return;
  }
  failures++;
  console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
}

const dead = () => new Error("Server has closed the connection.");

/** A read that fails with a dead socket `times` times, then succeeds. */
function flaky(times: number) {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    run: async () => {
      calls++;
      if (calls <= times) throw dead();
      return "rows";
    },
  };
}

const FAST = { backoffMs: 1 };

async function main() {
  console.log("\nThe happy path\n");

  const clean = flaky(0);
  check(
    "a read that works is not retried",
    (await retryDeadConnectionRead("findMany", clean.run, FAST)) === "rows" &&
      clean.calls === 1,
    `calls=${clean.calls}`,
  );

  console.log("\nDraining a pool of dead sockets\n");

  // The regression this whole change exists for: after a restart every pooled
  // connection is stale, and each failed attempt discards exactly one.
  const restart = flaky(POOL_MAX);
  const recovered = await retryDeadConnectionRead("findMany", restart.run, FAST);
  check(
    `survives a full pool of ${POOL_MAX} dead connections`,
    recovered === "rows",
    `calls=${restart.calls}`,
  );
  check(
    "uses one attempt per pooled connection, plus the first",
    restart.calls === POOL_MAX + 1,
    `calls=${restart.calls}`,
  );

  const single = flaky(1);
  await retryDeadConnectionRead("findMany", single.run, FAST);
  check("one stale socket costs one retry", single.calls === 2, `calls=${single.calls}`);

  console.log("\nGiving up\n");

  const hopeless = flaky(Number.MAX_SAFE_INTEGER);
  let threw: unknown;
  try {
    await retryDeadConnectionRead("findMany", hopeless.run, FAST);
  } catch (error) {
    threw = error;
  }
  check("a permanently dead pool eventually throws", threw instanceof Error);
  check(
    "and stops at the attempt ceiling rather than looping",
    hopeless.calls === POOL_MAX + 1,
    `calls=${hopeless.calls}`,
  );

  console.log("\nWhat must never be retried\n");

  let writes = 0;
  try {
    await retryDeadConnectionRead(
      "create",
      async () => {
        writes++;
        throw dead();
      },
      FAST,
    );
  } catch {
    // expected
  }
  // A write that failed *after* reaching the server would be applied twice.
  check("a write is never retried, even on a dead socket", writes === 1, `calls=${writes}`);

  let genuine = 0;
  try {
    await retryDeadConnectionRead(
      "findMany",
      async () => {
        genuine++;
        throw new Error("Unique constraint failed on the fields: (`slug`)");
      },
      FAST,
    );
  } catch {
    // expected
  }
  check("a real query error fails fast", genuine === 1, `calls=${genuine}`);

  let refused = 0;
  try {
    await retryDeadConnectionRead(
      "findMany",
      async () => {
        refused++;
        throw new Error("connect ECONNREFUSED 127.0.0.1:51214");
      },
      FAST,
    );
  } catch {
    // expected
  }
  check(
    "a refused connection is not retried — nothing is listening",
    refused === 1,
    `calls=${refused}`,
  );

  console.log("\nThe deadline\n");

  // A hung server, not a dead one: each attempt burns time rather than
  // failing quickly, which is how six retries could hold a request for a
  // minute if nothing bounded them.
  let slow = 0;
  const startedAt = Date.now();
  try {
    await retryDeadConnectionRead(
      "findMany",
      async () => {
        slow++;
        await new Promise((resolve) => setTimeout(resolve, 40));
        throw dead();
      },
      { backoffMs: 1, deadlineMs: 100 },
    );
  } catch {
    // expected
  }
  const elapsed = Date.now() - startedAt;
  check("a hung server stops at the deadline", slow < POOL_MAX + 1, `calls=${slow}`);
  check("and does not run away with the request", elapsed < 400, `${elapsed}ms`);

  console.log("\nPredicates\n");

  // --- the shapes the driver actually throws -------------------------------
  //
  // This block is the regression that made every retry above unreachable in
  // production. The adapter raises `ConnectionClosed` — two words, no spaces —
  // and only the client's wrapper spells it out as prose. A predicate that
  // knew just the prose form saw the raw adapter error, decided it was not a
  // connection failure, and rethrew immediately.
  const adapterError = new Error("ConnectionClosed");
  adapterError.name = "DriverAdapterError";
  check("recognises the driver's ConnectionClosed", isDeadConnection(adapterError));

  const byCode = Object.assign(
    new Error("Invalid `prisma.x.findMany()` invocation"),
    { code: "P1017" },
  );
  check("recognises Prisma's P1017 by code alone", isDeadConnection(byCode));

  const wrapped = new Error("Invalid `prisma.x.findMany()` invocation", {
    cause: adapterError,
  });
  check("finds a dead connection nested in `cause`", isDeadConnection(wrapped));

  check(
    "does not false-positive walking a cause chain",
    !isDeadConnection(new Error("outer", { cause: new Error("inner") })),
  );

  let adapterCalls = 0;
  await retryDeadConnectionRead(
    "findMany",
    async () => {
      adapterCalls++;
      if (adapterCalls <= 2) {
        const error = new Error("ConnectionClosed");
        error.name = "DriverAdapterError";
        throw error;
      }
      return "rows";
    },
    FAST,
  );
  check(
    "and retries on it rather than rethrowing at once",
    adapterCalls === 3,
    `calls=${adapterCalls}`,
  );

  check("recognises a closed connection", isDeadConnection(dead()));
  check("recognises ECONNRESET", isDeadConnection(new Error("read ECONNRESET")));
  check(
    "does not treat a constraint violation as a dead socket",
    !isDeadConnection(new Error("Unique constraint failed")),
  );
  check("findMany is retryable", isRetryableOperation("findMany"));
  check("update is not", !isRetryableOperation("update"));

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
