/**
 * Session helpers layered on top of the untouched api.js.
 *
 * Login/logout/me use the cookie session added to the Express app, so no token
 * is ever written to localStorage by the SPA. api.js's own `Session` is cleared
 * on login/logout so a leftover bearer token from the legacy pages cannot
 * shadow the cookie session.
 *
 * All other calls still go through api.js verbatim. They are same-origin
 * requests through the Vite proxy, so the browser attaches the cookie for them.
 */
import { CollectiumAPI as BaseAPI, Session } from './api.js';

const API_ROOT = '/api';

async function parseBody(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function fail(res, data) {
  const err = new Error(
    data.error || `Request failed (${res.status}) — is the API server running on :5000?`
  );
  err.status = res.status;
  err.code = data.code;
  return err;
}

/** Sign in. Resolves to `{ profile }`; the session lives in an httpOnly cookie. */
export async function login(email, password) {
  const res = await fetch(`${API_ROOT}/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await parseBody(res);
  if (!res.ok) throw fail(res, data);

  // Never keep the bearer token api.js would otherwise persist.
  Session.clear();
  return data;
}

/** Resolve the signed-in profile, or null for a guest. Never throws. */
export async function me() {
  try {
    const res = await fetch(`${API_ROOT}/auth/me`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (res.status === 401 || res.status === 404) {
      Session.clear();
      return null;
    }
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    // Drop any bearer token left behind by the legacy pages: the cookie is the
    // session now, and a stale header would take precedence over it server-side.
    Session.clear();
    return data?.profile ?? null;  } catch {
    // API unreachable: render as a guest rather than crashing the app shell.
    return null;
  }
}

/** End the session and clear the cookies. */
export async function logout() {
  try {
    await fetch(`${API_ROOT}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    /* offline is fine: the local clear below still applies */
  }
  Session.clear();
}

export const CollectiumAPI = {
  ...BaseAPI,
  login,
  me,
  logout,
};

export { Session };
