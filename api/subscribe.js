import { neon } from '@neondatabase/serverless';
import { createHash } from 'node:crypto';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BODY_BYTES = 1024;

async function readBody(req) {
  if (req.body !== undefined) {
    const declaredLength = Number(req.headers?.['content-length']);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      throw Object.assign(new Error('Request too large'), { statusCode: 413 });
    }
    if (typeof req.body === 'string') {
      if (Buffer.byteLength(req.body, 'utf8') > MAX_BODY_BYTES) {
        throw Object.assign(new Error('Request too large'), { statusCode: 413 });
      }
      return JSON.parse(req.body);
    }
    if (Buffer.byteLength(JSON.stringify(req.body) ?? '', 'utf8') > MAX_BODY_BYTES) {
      throw Object.assign(new Error('Request too large'), { statusCode: 413 });
    }
    return req.body;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Request too large'), { statusCode: 413 });
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(data));
}

// POST /api/subscribe { email } — works as a Vercel function and under server.js
export default async function handler(req, res) {
  res.setHeader('Allow', 'POST');
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  const contentType = req.headers?.['content-type'];
  if (!contentType || !/^application\/json(?:\s*;|\s*$)/i.test(contentType)) {
    return send(res, 415, { error: 'Content-Type must be application/json' });
  }

  let email;
  try {
    const body = await readBody(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return send(res, 400, { error: 'Request body must be a JSON object' });
    }
    if (Object.keys(body).some((key) => key !== 'email')) {
      return send(res, 400, { error: 'Unexpected request field' });
    }
    if (typeof body.email !== 'string') return send(res, 400, { error: 'Invalid email' });
    email = body.email.trim().toLowerCase();
  } catch (error) {
    return send(res, error?.statusCode === 413 ? 413 : 400, {
      error: error?.statusCode === 413 ? 'Request body too large' : 'Invalid request body',
    });
  }
  if (!EMAIL.test(email) || email.length > 254) return send(res, 400, { error: 'Invalid email' });

  try {
    if (!process.env.DATABASE_URL) throw new Error('Database configuration unavailable');
    const sql = neon(process.env.DATABASE_URL);
    const address = getClientAddress(req);
    if (!address) return send(res, 503, { error: 'Request could not be rate limited' });
    const addressHash = createHash('sha256').update(address).digest('hex');
    const [limit] = await sql`
      INSERT INTO subscription_rate_limits (address_hash, window_start, request_count)
      VALUES (${addressHash}, date_trunc('minute', now()), 1)
      ON CONFLICT (address_hash, window_start)
      DO UPDATE SET request_count = subscription_rate_limits.request_count + 1
      RETURNING request_count
    `;
    if (Number(limit.request_count) > 10) {
      res.setHeader('Retry-After', '60');
      return send(res, 429, { error: 'Too many requests. Please try again shortly.' });
    }
    // a repeat sign-up is not an error: the address is already on the list
    await sql`INSERT INTO subscribers (email) VALUES (${email}) ON CONFLICT (email) DO NOTHING`;
    return send(res, 200, { ok: true });
  } catch (error) {
    // Keep subscriber addresses, SQL details, and connection information out of logs.
    console.error('subscribe failed:', error instanceof Error ? error.name : 'unknown error');
    return send(res, 500, { error: 'Could not save email' });
  }
}

function getClientAddress(req) {
  // Vercel replaces x-real-ip at its edge. Never trust forwarded headers on
  // the standalone server, where a caller can supply them directly.
  if (process.env.VERCEL === '1') {
    const address = req.headers?.['x-real-ip'];
    return typeof address === 'string' && address.length <= 64 ? address : null;
  }
  const address = req.socket?.remoteAddress;
  return typeof address === 'string' && address.length <= 64 ? address : null;
}
