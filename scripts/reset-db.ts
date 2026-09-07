import { config } from 'dotenv';
config({ path: '.env.local' });

import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';

async function main() {
  // Cascades from students remove courses, skills, deadlines, plans, sessions.
  await db.execute(sql`truncate table students cascade`);
  console.log('Database reset: all student data removed.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
