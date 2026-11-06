import { neon } from '@neondatabase/serverless';

// schema changes use the direct connection; the app itself uses the pooled DATABASE_URL
const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL);

await sql`
  CREATE TABLE IF NOT EXISTS subscribers (
    id         serial PRIMARY KEY,
    email      text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
console.log('subscribers table ready');
