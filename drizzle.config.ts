import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

config({ path: '.env.local' });

const PGLITE_PATH = process.env.PGLITE_PATH ?? './data/coach.pglite';
// drizzle-kit's pglite driver needs its parent directory to already exist; `data/` is
// gitignored, so create it here too (independent of src/db/client.ts's own PGlite instance).
if (!process.env.DATABASE_URL) mkdirSync(dirname(PGLITE_PATH), { recursive: true });

export default defineConfig(
  process.env.DATABASE_URL
    ? {
        dialect: 'postgresql',
        schema: './src/db/schema.ts',
        out: './drizzle',
        dbCredentials: { url: process.env.DATABASE_URL },
      }
    : {
        dialect: 'postgresql',
        driver: 'pglite',
        schema: './src/db/schema.ts',
        out: './drizzle',
        dbCredentials: { url: PGLITE_PATH },
      },
);
