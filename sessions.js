/**
 * Cookie-backed sessions for the SPA.
 *
 * The API also accepts `Authorization: Bearer <token>` for non-browser API
 * clients. The SPA uses an httpOnly cookie instead, so no token is ever stored
 * in localStorage.
 */
import { supabase, isAuthError } from './supabaseClient.js';

export const ACCESS_COOKIE = 'collectium_access';
export const REFRESH_COOKIE = 'collectium_refresh';

// Refresh a little early so a request never races the expiry boundary.
const EXPIRY_SKEW_MS = 30_000;

function cookieOptions(maxAgeSeconds) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    // localhost is plain http; only mark Secure when actually served over https.
    secure: process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE === 'true',
    // Express expects milliseconds here, not seconds.
    maxAge: maxAgeSeconds * 1000,
  };
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function setSessionCookies(res, session) {
  if (!session?.access_token) return;
  res.cookie(ACCESS_COOKIE, session.access_token, cookieOptions(session.expires_in || 3600));
  if (session.refresh_token) {
    res.cookie(REFRESH_COOKIE, session.refresh_token, cookieOptions(60 * 60 * 24 * 30));
  }
}

export function clearSessionCookies(res) {
  res.clearCookie(ACCESS_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_COOKIE, { path: '/' });
}

/** 401 + AUTH_REQUIRED for a dead session, 400 for anything else. */
export function sendAuthError(res, error) {
  if (isAuthError(error)) {
    clearSessionCookies(res);
    return res.status(401).json({ error: 'Session expired. Please sign in again.', code: 'AUTH_REQUIRED' });
  }
  return res.status(400).json({ error: error.message });
}

function tokenExpiryMs(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return Number(payload.exp) * 1000;
  } catch {
    return 0;
  }
}

function isExpired(token) {
  const exp = tokenExpiryMs(token);
  return !exp || exp - EXPIRY_SKEW_MS <= Date.now();
}

/**
 * Resolves the request's access token from the header or the cookie, refreshes
 * an expired cookie session, and injects the header so every existing route
 * keeps working unchanged. Only runs for /api requests.
 */
export async function attachSession(req, res, next) {
  if (!req.path.startsWith('/api')) return next();

  try {
    const cookies = parseCookies(req.headers.cookie || '');
    req.cookies = cookies;

    const headerToken = req.headers.authorization?.split(' ')[1] || null;
    let token = headerToken || cookies[ACCESS_COOKIE] || null;

    if (!headerToken && cookies[REFRESH_COOKIE] && (!token || isExpired(token))) {
      const { data, error } = await supabase.auth.refreshSession({
        refresh_token: cookies[REFRESH_COOKIE],
      });
      if (!error && data?.session) {
        token = data.session.access_token;
        setSessionCookies(res, data.session);
      } else {
        token = null;
        clearSessionCookies(res);
      }
    }

    if (token && !headerToken) req.headers.authorization = `Bearer ${token}`;
    req.accessToken = token;
    next();
  } catch (err) {
    next(err);
  }
}
