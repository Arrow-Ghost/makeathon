import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { rateLimit } from './_lib/db.js';
import { appendCookie, clientAddress, getCookie, isProduction, redirect, route } from './_lib/http.js';
import { startSession } from './_lib/session.js';

// "Continue with Google": the OAuth authorization-code flow with PKCE, run on the server.
// The person's browser only ever navigates to Google and back, so no Google script runs
// on our pages and the Content-Security-Policy stays as it is.
//
// GET /api/google?status=1               -> { enabled, email }
// GET /api/google?next=register&join=… -> 302 to Google (next: register | admin)
// GET /api/google?code=…&state=…        -> Google's callback: starts a session, 302 back

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const COOKIE = 'mk_oauth';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BACK = /^\/(register|admin)(\?join=[A-Z0-9]{6})?$/;

const b64url = (value) => Buffer.from(value).toString('base64url');
const enabled = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

// Must match a redirect URI registered on the Google OAuth client exactly.
function redirectUri(req) {
  if (process.env.PUBLIC_URL) return `${process.env.PUBLIC_URL.replace(/\/+$/, '')}/api/google`;
  const https = process.env.VERCEL === '1' || req.headers['x-forwarded-proto'] === 'https';
  return `${https ? 'https' : 'http'}://${req.headers.host}/api/google`;
}

// Holds state, the PKCE verifier and the return path for the 10 minutes a sign-in may take.
function flowCookie(value, maxAge) {
  const parts = [`${COOKIE}=${value}`, 'Path=/api/google', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (isProduction()) parts.push('Secure');
  return parts.join('; ');
}

// Only ever back to /register (keeping a team invite) or /admin, never an arbitrary URL.
function destination(next, join) {
  if (next === 'admin') return '/admin';
  const code = String(join ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return code.length === 6 ? `/register?join=${code}` : '/register';
}

function withStatus(path, status) {
  const url = new URL(path, 'http://localhost');
  url.searchParams.set('auth', status);
  return url.pathname + url.search;
}

function start(req, res, q) {
  const back = destination(q.get('next'), q.get('join'));
  if (!enabled()) return redirect(res, withStatus(back, 'unavailable'));
  const state = b64url(randomBytes(24));
  const verifier = b64url(randomBytes(48));
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  appendCookie(res, flowCookie(b64url(JSON.stringify({ state, verifier, back })), 600));
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(req),
    response_type: 'code',
    // only the email address: no name, photo or other Google data
    scope: 'openid email',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    // lets people with several Google accounts pick the one they register with;
    // no `hd` parameter, so any Google account works, VIT or not
    prompt: 'select_account',
  });
  return redirect(res, `${AUTH_URL}?${params}`);
}

// Trades the one-time code for the person's verified email address.
async function verifiedEmail(req, code, verifier) {
  if (!code || code.length > 2048) throw new Error('missing_code');
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(req),
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`token_${response.status}`);
  const { id_token: idToken } = await response.json();
  // The ID token came straight from Google's token endpoint over TLS in exchange for our
  // client secret, so (as Google's OpenID Connect guide notes) its signature need not be
  // re-checked; its claims still are.
  let claims;
  try {
    claims = JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString('utf8'));
  } catch {
    throw new Error('bad_id_token');
  }
  if (!ISSUERS.includes(claims.iss) || claims.aud !== process.env.GOOGLE_CLIENT_ID || !(claims.exp * 1000 > Date.now())) {
    throw new Error('bad_claims');
  }
  if (claims.email_verified !== true || typeof claims.email !== 'string') throw new Error('unverified_email');
  const email = claims.email.trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) throw new Error('bad_email');
  return email;
}

async function finish(req, res, q) {
  let saved = null;
  try {
    saved = JSON.parse(Buffer.from(getCookie(req, COOKIE) || '', 'base64url').toString('utf8'));
  } catch {}
  appendCookie(res, flowCookie('', 0));
  const back = typeof saved?.back === 'string' && BACK.test(saved.back) ? saved.back : '/register';
  if (q.get('error')) return redirect(res, withStatus(back, q.get('error') === 'access_denied' ? 'cancelled' : 'failed'));

  // the state must match the one this browser was given, or the sign-in was not started here
  const got = Buffer.from(q.get('state') || '');
  const want = Buffer.from(typeof saved?.state === 'string' ? saved.state : '');
  if (!want.length || got.length !== want.length || !timingSafeEqual(got, want) || typeof saved.verifier !== 'string') {
    return redirect(res, withStatus(back, 'failed'));
  }
  try {
    await rateLimit('google-ip', clientAddress(req), 30, 600);
    const email = await verifiedEmail(req, q.get('code'), saved.verifier);
    await startSession(res, email);
    return redirect(res, back);
  } catch (error) {
    if (error?.status === 429) return redirect(res, withStatus(back, 'busy'));
    // fixed codes only (token_400, bad_claims, …): no addresses or tokens in logs
    console.error('google sign-in failed:', error?.code || error?.message || 'unknown error');
    return redirect(res, withStatus(back, 'failed'));
  }
}

export default route('google', {
  async GET(req, res) {
    const q = new URL(req.url, 'http://localhost').searchParams;
    // which sign-in methods the pages offer: Google, and emailed codes only once SMTP is set up
    if (q.has('status')) return { enabled: enabled(), email: Boolean(process.env.SMTP_HOST) };
    if (q.has('code') || q.has('error') || q.has('state')) return finish(req, res, q);
    return start(req, res, q);
  },
});
