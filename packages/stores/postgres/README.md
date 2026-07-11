# 📦 `@limitkit/postgres`

[![npm version](https://img.shields.io/npm/v/@limitkit/postgres)](https://www.npmjs.com/package/@limitkit/postgres)
[![downloads](https://img.shields.io/npm/dw/@limitkit/postgres)](https://www.npmjs.com/package/@limitkit/postgres)
[![license](https://img.shields.io/npm/l/@limitkit/postgres)](https://github.com/alphatrann/limitkit/blob/main/LICENSE)

**Postgres-backed store and durable rate limiting policies for LimitKit.**

Designed for teams that already run Postgres and don't want to run Redis just for rate limiting. State survives restarts and is queryable with plain SQL.

Each request runs inside a SQL transaction using `SELECT ... FOR UPDATE`, which avoids race conditions and ensures correctness even under high concurrency.

---

## ⚡ Installation

```bash
npm install @limitkit/core @limitkit/postgres pg
```

---

## ⚡ Quick Start

```ts
import { RateLimiter } from "@limitkit/core";
import { PostgresStore, initSchema, fixedWindow } from "@limitkit/postgres";
import { Pool } from "pg";

const pool = new Pool();

// Convenience for quick starts / local dev / tests. Production users should
// prefer their own migration pipeline pointed at sql/001_init.sql instead.
await initSchema(pool);

const limiter = new RateLimiter({
  store: new PostgresStore(pool),

  rules: [
    {
      name: "global",
      key: "global",
      policy: fixedWindow({
        window: 60,
        limit: 100,
      }),
    },
  ],
});

await limiter.consume(ctx);
```

---

## 🧠 How it works

Every algorithm's state lives in one anchor row (`rate_limit_state`) plus a per-algorithm child row it foreign-keys into. A `consume()` call runs, in a single transaction at Postgres's default `READ COMMITTED` isolation level:

1. Upsert + lock the anchor row for the key.
2. `SELECT ... FOR UPDATE` the child row (if it exists).
3. Run the algorithm's pure reducer -- the exact same function `@limitkit/memory` uses, imported from `@limitkit/core`'s shared kernel, so behavior is identical across stores.
4. Upsert the child row with the new state.
5. Commit.

Each transaction locks exactly one row, so there's no cross-key invariant to protect and no deadlock risk.

Sliding Window is the one exception: it has no single state row to lock, so it stores one row per accepted request in `sliding_window_log` and uses the anchor row's own lock as its mutex.

```
app instances → transaction (SELECT ... FOR UPDATE) → Postgres → decision
```

---

## ⚠️ Pool-sizing caveat

A `FOR UPDATE` transaction holds a pooled connection for the full round-trip on that key. For a very hot single key (e.g. a global rate limit under heavy traffic), this can serialize requests through pool-connection contention in a way Redis's single Lua round-trip doesn't. Size your `pg.Pool` accordingly -- this is inherent to the transactional approach, not a bug to fix.

---

## 🧹 Pruning

Postgres has no per-row TTL the way Redis does. Idle keys accumulate forever otherwise. Wire `pruneOlderThan` into your own cron / `pg_cron` / scheduled job -- it is **not** run automatically by the library:

```ts
import { pruneOlderThan } from "@limitkit/postgres";

// delete anchor rows (and their child rows, via ON DELETE CASCADE)
// that haven't been touched in the last 7 days
await pruneOlderThan(pool, 7 * 24 * 60 * 60 * 1000);
```

---

## 🗄 Schema provisioning

`sql/001_init.sql` (shipped in the published package) is the canonical DDL and the source of truth. Point your own migration tool (Flyway, node-pg-migrate, Prisma migrate, ...) at it directly if you'd rather not use `initSchema()`.

```ts
import { initSchema } from "@limitkit/postgres";

await initSchema(pool); // idempotent, safe to call on every boot
await initSchema(pool, "my_custom_schema"); // custom schema name
```

Schema names are validated against a strict identifier allowlist before being used, since Postgres doesn't support parameterized identifiers.

---

## 🧩 What's Included

### 🗄 Store

```ts
import { Pool } from "pg";
import { PostgresStore } from "@limitkit/postgres";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

new PostgresStore(pool);
```

---

### ⚙️ Policies

`@limitkit/postgres` includes optimized implementations of common rate limiting strategies.

You have to ensure all the policies use the algorithm functions below from `@limitkit/postgres`

```ts
import { fixedWindow } from "@limitkit/postgres";
```

#### Fixed Window

```ts
fixedWindow({ window: 60, limit: 100 })
```

---

#### Sliding Window

```ts
slidingWindow({ window: 60, limit: 100 })
```

---

#### Sliding Window Counter

```ts
slidingWindowCounter({ window: 60, limit: 100 })
```

---

#### Token Bucket

```ts
tokenBucket({ capacity: 100, refillRate: 5 })
```

---

#### Leaky Bucket

```ts
leakyBucket({ capacity: 100, leakRate: 5 })
```

---

#### Shaping Leaky Bucket

Shaping leaky bucket is a special algorithm that is typically used in worker queues to handle backpressure by delaying operations.

Simply create a store, a traffic shaper and call `store.consume` with the shaper. The result contains `availableAt`, which tells when to execute this job.

```ts
import { Pool } from "pg";
import { PostgresStore, shapingLeakyBucket } from "@limitkit/postgres";

const pool = new Pool();
const store = new PostgresStore(pool);

const shaper = shapingLeakyBucket({
   capacity: 100,
   leakRate: 2 // requests per second
})

// somewhere in code
const now = Date.now()
const result = await store.consume(key, shaper, now, 1);
// schedule execution based on `availableAt`
setTimeout(() => handleJob(), result.availableAt - now);
```

---

#### GCRA

```ts
gcra({ burst: 5, interval: 1 })
```
