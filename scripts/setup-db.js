import { neon } from '@neondatabase/serverless';
import { readFile } from 'node:fs/promises';

// schema changes use the direct connection; the app itself uses the pooled DATABASE_URL
const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL);

await sql`
  CREATE TABLE IF NOT EXISTS subscribers (
    id         serial PRIMARY KEY,
    email      text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;

// the migrations are idempotent (CREATE ... IF NOT EXISTS), so re-running them is safe
for (const name of ['001_subscription_rate_limits.sql', '002_registration.sql']) {
  const file = await readFile(new URL(`../db/migrations/${name}`, import.meta.url), 'utf8');
  const statements = file
    .replace(/--.*$/gm, '')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
  for (const statement of statements) await sql.query(statement);
}
console.log('database tables ready');
