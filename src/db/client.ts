import { PGlite } from '@electric-sql/pglite';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { PgDatabase } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePostgresJs } from 'drizzle-orm/postgres-js';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import postgres from 'postgres';
import * as schema from './schema';

const PGLITE_PATH = process.env.PGLITE_PATH ?? './data/coach.pglite';

function createDb() {
  const url = process.env.DATABASE_URL;
  if (url) {
    // Supabase transaction pooler does not support prepared statements.
    // `max`/`idle_timeout` keep a serverless instance from holding more pooler slots than it needs.
    return drizzlePostgresJs(postgres(url, { prepare: false, max: 5, idle_timeout: 20 }), { schema });
  }
  // No DATABASE_URL (e.g. local dev with no Supabase project): fall back to an embedded
  // PGlite database persisted on disk, so the app works with zero external services.
  console.info(`No DATABASE_URL set — using embedded PGlite database at ${PGLITE_PATH}`);
  // PGlite's node filesystem backend needs its parent directory to already exist (it does not
  // create it recursively), and `data/` is gitignored, so a fresh clone won't have it yet.
  mkdirSync(dirname(PGLITE_PATH), { recursive: true });
  return drizzlePglite(new PGlite(PGLITE_PATH), { schema });
}

/**
 * `PgDatabase<PgQueryResultHKT, typeof schema>` is the narrowest common supertype of
 * `PostgresJsDatabase<typeof schema>` and `PgliteDatabase<typeof schema>` — both extend
 * `PgDatabase` parameterised by their own driver-specific `PgQueryResultHKT` subtype, so widening
 * to the base `PgQueryResultHKT` is the only way to name one type for both branches. All of
 * `select`/`insert`/`update`/`delete`/`transaction` are declared on `PgDatabase` itself and are
 * unaffected; only `execute()`'s result-row typing is widened (both drivers already return `unknown`
 * rows there in this codebase's usage, via `sql` template queries), so nothing in queries.ts or
 * reset-db.ts loses precision.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Cached on globalThis so Next dev HMR reuses one pool instead of leaking a new one per reload. */
const globalForDb = globalThis as typeof globalThis & { __mbaCoachDb?: Db };

/**
 * Lazily-created Drizzle client, so importing this module never needs env vars (e.g. during `next build`).
 * Forwarding `this` through the Proxy is safe because drizzle's PgDatabase keeps `session`/`dialect` as plain
 * instance properties and its query builders are real, unproxied objects.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const instance = (globalForDb.__mbaCoachDb ??= createDb());
    return Reflect.get(instance, prop, receiver);
  },
});
