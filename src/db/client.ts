import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  // Supabase transaction pooler does not support prepared statements.
  return drizzle(postgres(url, { prepare: false }), { schema });
}

export type Db = ReturnType<typeof createDb>;

let instance: Db | null = null;

/** Lazily-created Drizzle client, so importing this module never needs env vars (e.g. during `next build`). */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    instance ??= createDb();
    return Reflect.get(instance, prop, receiver);
  },
});
