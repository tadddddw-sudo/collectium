/**
 * Session helpers layered on top of api.js.
 *
 * Login/logout/me use the cookie session added to the Express app, so no token
 * is ever written to localStorage. Every request is same-origin (the Vite dev
 * proxy in development, Express itself in production), so the browser attaches
 * the cookie automatically.
 */
import { CollectiumAPI as BaseAPI } from './api.js';

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
  const err = new Error(data.error || `Request failed (${res.status})`);
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
  return data;
}

/** Resolve the signed-in profile, or null for a guest. Never throws. */
export async function me() {
  try {
    const res = await fetch(`${API_ROOT}/auth/me`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (res.status === 401 || res.status === 404) return null;
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.profile ?? null;
  } catch {
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
    /* offline is fine: the server cookie is the only copy of the session */
  }
}

export const CollectiumAPI = {
  ...BaseAPI,
  login,
  me,
  logout,
};
