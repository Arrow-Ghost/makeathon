// Request/response helpers for the API functions. They use only the plain Node
// req/res surface, so the same handlers run as Vercel functions and under server.js.
import { createHash } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message, { field, headers } = {}) {
    super(message);
    this.status = status;
    this.field = field;
    this.headers = headers;
  }
}

export const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');

export const isProduction = () => process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';

export function send(res, status, data, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  res.end(JSON.stringify(data));
}

// Adds a Set-Cookie header without replacing one set earlier in the same response.
export function appendCookie(res, value) {
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', prev ? [].concat(prev, value) : value);
}

export function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}

export async function readJson(req, maxBytes = 16 * 1024) {
  const type = req.headers?.['content-type'];
  if (!type || !/^application\/json(?:\s*;|\s*$)/i.test(type)) {
    throw new HttpError(415, 'Content-Type must be application/json');
  }
  const declared = Number(req.headers?.['content-length']);
  if (Number.isFinite(declared) && declared > maxBytes) throw new HttpError(413, 'Request body too large');

  let body;
  try {
    if (req.body !== undefined) {
      // Vercel has already read (and usually parsed) the body
      const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body) ?? '';
      if (Buffer.byteLength(raw, 'utf8') > maxBytes) throw new HttpError(413, 'Request body too large');
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } else {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > maxBytes) throw new HttpError(413, 'Request body too large');
        chunks.push(chunk);
      }
      body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'Invalid request body');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Request body must be a JSON object');
  }
  return body;
}

export function getCookie(req, name) {
  const header = req.headers?.cookie;
  if (typeof header !== 'string') return null;
  for (const part of header.split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === name) {
      try {
        return decodeURIComponent(part.slice(at + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

// A browser always sends Origin on a cross-site POST; refuse any that is not this site.
function sameOrigin(req) {
  const origin = req.headers?.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

export function clientAddress(req) {
  // Vercel replaces x-real-ip at its edge. Never trust forwarded headers on
  // the standalone server, where a caller can supply them directly.
  const address = process.env.VERCEL === '1' ? req.headers?.['x-real-ip'] : req.socket?.remoteAddress;
  return typeof address === 'string' && address.length <= 64 ? address : 'unknown';
}

// Wraps per-method handlers with method checks, the origin check and error handling.
// A handler returns the JSON body to send with status 200.
export function route(name, handlers) {
  return async function handler(req, res) {
    const fn = handlers[req.method];
    if (!fn) {
      res.setHeader('Allow', Object.keys(handlers).join(', '));
      return send(res, 405, { error: 'Method not allowed' });
    }
    try {
      if (req.method !== 'GET' && !sameOrigin(req)) throw new HttpError(403, 'Cross-site request refused');
      const out = await fn(req, res);
      if (!res.writableEnded) send(res, 200, out ?? { ok: true });
    } catch (error) {
      if (error instanceof HttpError) {
        return send(res, error.status, { error: error.message, ...(error.field && { field: error.field }) }, error.headers);
      }
      // Postgres error codes and names only: no addresses, SQL or connection details in logs.
      console.error(`${name} failed:`, error?.code || error?.name || 'unknown error');
      send(res, 500, { error: 'Something went wrong on our side. Please try again.' });
    }
  };
}
