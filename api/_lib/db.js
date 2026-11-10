import { neon } from '@neondatabase/serverless';
import { HttpError, sha256 } from './http.js';

let sql;

export function db() {
  if (!process.env.DATABASE_URL) throw new Error('Database configuration unavailable');
  return (sql ??= neon(process.env.DATABASE_URL));
}

// Fixed-window counter shared by every instance; throws 429 past `max` hits per window.
export async function rateLimit(bucket, key, max, windowSeconds) {
  const [row] = await db()`
    INSERT INTO rate_limits (bucket, key_hash, window_start, request_count)
    VALUES (${bucket}, ${sha256(key)},
            to_timestamp(floor(extract(epoch FROM now()) / ${windowSeconds}::int) * ${windowSeconds}::int), 1)
    ON CONFLICT (bucket, key_hash, window_start)
    DO UPDATE SET request_count = rate_limits.request_count + 1
    RETURNING request_count`;
  if (Number(row.request_count) > max) {
    throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.', {
      headers: { 'Retry-After': String(windowSeconds) },
    });
  }
}

// Deletes expired codes, sessions and counters. Called now and then, not on every request.
export async function sweep() {
  const sql = db();
  await Promise.all([
    sql`DELETE FROM email_codes WHERE expires_at < now() - interval '1 day'`,
    sql`DELETE FROM sessions WHERE expires_at < now()`,
    sql`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`,
  ]);
}
