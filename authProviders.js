/**
 * Auth0 next to Supabase Auth.
 *
 * Users who signed up with email and password have a Supabase Auth token.
 * Users who use "Continue with Google" sign in through Auth0's Google
 * connection and have an Auth0 token. Supabase accepts both when the Auth0
 * tenant is added under Authentication -> Third-Party Auth.
 *
 * Google is the only Auth0 connection the app ever requests: the authorize URL
 * always names it, so Auth0 skips its own login page and goes straight to
 * Google.
 *
 * This file is the one place that knows the difference:
 *   - getUserFromToken(token)  who is this, whichever provider issued it
 *   - the Google-via-Auth0 login helpers (authorize URL, code exchange, refresh, delete)
 *
 * Auth0 is optional. Without AUTH0_DOMAIN, AUTH0_CLIENT_ID,
 * AUTH0_CLIENT_SECRET, AUTH0_AUDIENCE and APP_URL, auth0Enabled() is false and
 * the app behaves exactly as before.
 */
import crypto from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { supabase } from './supabaseClient.js';

const DOMAIN = (process.env.AUTH0_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
const CLIENT_ID = process.env.AUTH0_CLIENT_ID || '';
const CLIENT_SECRET = process.env.AUTH0_CLIENT_SECRET || '';
const AUDIENCE = process.env.AUTH0_AUDIENCE || '';
// Optional: a machine-to-machine app allowed to delete users (delete:users).
const MGMT_CLIENT_ID = process.env.AUTH0_MGMT_CLIENT_ID || '';
const MGMT_CLIENT_SECRET = process.env.AUTH0_MGMT_CLIENT_SECRET || '';

const ISSUER = `https://${DOMAIN}/`;
const FETCH_TIMEOUT_MS = 10_000;

/** The Auth0 social connection for Google. The only one the app uses. */
const GOOGLE_CONNECTION = 'google-oauth2';

export function auth0Enabled() {
  return Boolean(DOMAIN && CLIENT_ID && CLIENT_SECRET && AUDIENCE && process.env.APP_URL);
}

if (DOMAIN && !auth0Enabled()) {
  console.error(
    'Auth0 is only partly configured: set AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, ' +
      'AUTH0_AUDIENCE and APP_URL. Auth0 sign-in is disabled until then.'
  );
}

// Fetches Auth0's public keys once and caches them (jose handles rotation).
const jwks = DOMAIN ? createRemoteJWKSet(new URL(`${ISSUER}.well-known/jwks.json`)) : null;

export function callbackUrl() {
  return new URL('/api/auth/auth0/callback', process.env.APP_URL).toString();
}

/** The `iss` claim of a JWT without verifying it. Only used to pick a verifier. */
function peekIssuer(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).iss ?? null;
  } catch {
    return null;
  }
}

export function isAuth0Token(token) {
  return Boolean(DOMAIN) && peekIssuer(token) === ISSUER;
}

/** Verified claims of an Auth0 access token, or null if it is not valid. */
export async function verifyAuth0Token(token) {
  if (!auth0Enabled()) return null;
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['RS256'],
    });
    return typeof payload.sub === 'string' && payload.sub ? payload : null;
  } catch {
    return null;
  }
}

/**
 * Who sent this token? `{ id, email, provider }` or null.
 *
 * `id` is the token's `sub`: a UUID for Supabase Auth, 'auth0|...' or
 * 'google-oauth2|...' for Auth0. It is what profiles.id and collections.user_id
 * hold. Never trust a token without going through here (or Supabase itself).
 */
export async function getUserFromToken(token) {
  if (!token) return null;

  if (isAuth0Token(token)) {
    const claims = await verifyAuth0Token(token);
    if (!claims) return null;
    return { id: claims.sub, email: claims.email ?? null, provider: 'auth0' };
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email ?? null, provider: 'supabase' };
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error_description || data.error || `Auth0 error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ---- Login (authorization code flow with PKCE) ------------------------------

export function newPkce() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function authorizeUrl({ state, challenge }) {
  const url = new URL(`${ISSUER}authorize`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', callbackUrl());
  // offline_access gives a refresh token, so sessions last past the access token's life.
  url.searchParams.set('scope', 'openid profile email offline_access');
  url.searchParams.set('audience', AUDIENCE);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('connection', GOOGLE_CONNECTION);
  return url.toString();
}

/** Swap the callback `code` for `{ access_token, refresh_token, expires_in, ... }`. */
export function exchangeCode(code, verifier) {
  return postJson(`${ISSUER}oauth/token`, {
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
    code_verifier: verifier,
    redirect_uri: callbackUrl(),
  });
}

/** `{ access_token, refresh_token?, expires_in }` for a refresh token, or null if Auth0 refuses it. */
export async function refreshAuth0Session(refreshToken) {
  if (!auth0Enabled()) return null;
  try {
    return await postJson(`${ISSUER}oauth/token`, {
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
    });
  } catch {
    return null;
  }
}

/** Best effort: stop a refresh token from working after sign-out. */
export async function revokeAuth0RefreshToken(refreshToken) {
  if (!auth0Enabled() || !refreshToken) return;
  try {
    await postJson(`${ISSUER}oauth/revoke`, {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      token: refreshToken,
    });
  } catch {
    /* already revoked or Auth0 unreachable; the cookies are cleared either way */
  }
}

/** Name, email and picture for the signed-in user. */
export async function fetchUserInfo(accessToken) {
  const res = await fetch(`${ISSUER}userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Auth0 userinfo error ${res.status}`);
  return res.json();
}

/** Where to send the browser to end the Auth0 single sign-on session too. */
export function logoutUrl(returnTo) {
  const url = new URL(`${ISSUER}v2/logout`);
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('returnTo', returnTo);
  return url.toString();
}

// ---- Account deletion ---------------------------------------------------------

export function canDeleteAuth0Users() {
  return Boolean(DOMAIN && MGMT_CLIENT_ID && MGMT_CLIENT_SECRET);
}

/** Delete the user from Auth0 with the Management API. Throws on failure. */
export async function deleteAuth0User(userId) {
  const { access_token: mgmtToken } = await postJson(`${ISSUER}oauth/token`, {
    grant_type: 'client_credentials',
    client_id: MGMT_CLIENT_ID,
    client_secret: MGMT_CLIENT_SECRET,
    audience: `${ISSUER}api/v2/`,
  });
  const res = await fetch(`${ISSUER}api/v2/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${mgmtToken}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  // 404 means it is already gone, which is what we wanted.
  if (!res.ok && res.status !== 404) throw new Error(`Auth0 delete error ${res.status}`);
}
