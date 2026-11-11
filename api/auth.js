import { randomInt, timingSafeEqual } from 'node:crypto';
import { db, rateLimit, sweep } from './_lib/db.js';
import { isAdmin } from './_lib/event.js';
import { HttpError, clientAddress, readJson, route, sha256 } from './_lib/http.js';
import { sendCode } from './_lib/mail.js';
import { endSession, getSession, startSession } from './_lib/session.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

function readEmail(body) {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL.test(email) || email.length > 254) throw new HttpError(400, 'Enter a valid email address', { field: 'email' });
  return email;
}

const codeHash = (email, code) => sha256(`${email}:${code}`);

// GET  /api/auth                       -> { email, admin } for the current session, or 401
// POST /api/auth { action: 'request', email }       sends a 6-digit code
// POST /api/auth { action: 'verify', email, code }  checks it and starts a session
// POST /api/auth { action: 'logout' }
export default route('auth', {
  async GET(req) {
    const session = await getSession(req);
    if (!session) throw new HttpError(401, 'Not signed in');
    return { email: session.email, admin: session.admin };
  },

  async POST(req, res) {
    const body = await readJson(req, 1024);
    const sql = db();
    const address = clientAddress(req);

    if (body.action === 'request') {
      const email = readEmail(body);
      await rateLimit('code-ip', address, 15, 600);
      await rateLimit('code-email', email, 4, 600);
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const expires = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString();
      await sql`
        INSERT INTO email_codes (email, code_hash, expires_at, attempts)
        VALUES (${email}, ${codeHash(email, code)}, ${expires}, 0)
        ON CONFLICT (email) DO UPDATE
          SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, attempts = 0, created_at = now()`;
      await sendCode(email, code);
      if (Math.random() < 0.05) await sweep().catch(() => {});
      return { ok: true };
    }

    if (body.action === 'verify') {
      const email = readEmail(body);
      const code = typeof body.code === 'string' ? body.code.replace(/\D/g, '') : '';
      if (code.length !== 6) throw new HttpError(400, 'Enter the 6-digit code from the email', { field: 'code' });
      await rateLimit('verify-ip', address, 40, 600);
      // count the attempt before comparing, so parallel guesses cannot exceed the limit
      const [row] = await sql`
        UPDATE email_codes SET attempts = attempts + 1
        WHERE email = ${email} AND expires_at > now()
        RETURNING code_hash, attempts`;
      if (!row) throw new HttpError(400, 'That code has expired. Request a new one.', { field: 'code' });
      if (row.attempts > MAX_ATTEMPTS) throw new HttpError(429, 'Too many wrong codes. Request a new one.', { field: 'code' });
      const ok = timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(codeHash(email, code)));
      if (!ok) throw new HttpError(400, 'That code is not right. Check the email and try again.', { field: 'code' });
      await sql`DELETE FROM email_codes WHERE email = ${email}`;
      await startSession(res, email);
      return { email, admin: isAdmin(email) };
    }

    if (body.action === 'logout') {
      await endSession(req, res);
      return { ok: true };
    }

    throw new HttpError(400, 'Unknown action');
  },
});
