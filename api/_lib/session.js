import { randomBytes } from 'node:crypto';
import { db } from './db.js';
import { isAdmin } from './event.js';
import { HttpError, appendCookie, getCookie, isProduction, sha256 } from './http.js';

const COOKIE = 'mk_session';
// Admin sessions can read every participant's personal details, so they expire sooner.
const PARTICIPANT_TTL = 30 * 24 * 3600;
const ADMIN_TTL = 12 * 3600;

function cookie(value, maxAge) {
  const parts = [`${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (isProduction()) parts.push('Secure');
  return parts.join('; ');
}

export async function startSession(res, email) {
  const token = randomBytes(32).toString('base64url');
  const ttl = isAdmin(email) ? ADMIN_TTL : PARTICIPANT_TTL;
  const expires = new Date(Date.now() + ttl * 1000).toISOString();
  await db()`INSERT INTO sessions (token_hash, email, expires_at) VALUES (${sha256(token)}, ${email}, ${expires})`;
  appendCookie(res, cookie(token, ttl));
}

export async function getSession(req) {
  const token = getCookie(req, COOKIE);
  if (!token || token.length > 128) return null;
  const tokenHash = sha256(token);
  const [row] = await db()`SELECT email FROM sessions WHERE token_hash = ${tokenHash} AND expires_at > now()`;
  return row ? { email: row.email, admin: isAdmin(row.email), tokenHash } : null;
}

export async function requireSession(req) {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'Your session has ended. Sign in again to continue.');
  return session;
}

export async function endSession(req, res) {
  const session = await getSession(req);
  if (session) await db()`DELETE FROM sessions WHERE token_hash = ${session.tokenHash}`;
  appendCookie(res, cookie('', 0));
}
