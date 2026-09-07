import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  // Supabase transaction pooler does not support prepared statements.
  // `max`/`idle_timeout` keep a serverless instance from holding more pooler slots than it needs.
  return drizzle(postgres(url, { prepare: false, max: 5, idle_timeout: 20 }), { schema });
}

export type Db = ReturnType<typeof createDb>;

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
