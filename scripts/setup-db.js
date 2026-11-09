import { neon } from '@neondatabase/serverless';

// schema changes use the direct connection; the app itself uses the pooled DATABASE_URL
const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL);

await sql`
  CREATE TABLE IF NOT EXISTS subscribers (
    id         serial PRIMARY KEY,
    email      text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
await sql`
  CREATE TABLE IF NOT EXISTS subscription_rate_limits (
    address_hash char(64) NOT NULL,
    window_start timestamptz NOT NULL,
    request_count integer NOT NULL CHECK (request_count > 0),
    PRIMARY KEY (address_hash, window_start)
  )`;
console.log('database tables ready');
