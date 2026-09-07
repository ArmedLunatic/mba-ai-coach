import { config } from 'dotenv';
config({ path: '.env.local' });

import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';

async function main() {
  // Cascades from students remove courses, skills, deadlines, plans, sessions.
  await db.execute(sql`truncate table students cascade`);
  console.log('Database reset: all student data removed.');

  // PGlite has no separate server process to leave running — close its handle so the process
  // can exit on its own. The postgres-js pool has no such handle here; `process.exit(0)` covers it.
  if (!process.env.DATABASE_URL) {
    const client = (db as unknown as { $client: { close(): Promise<void> } }).$client;
    await client.close();
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
