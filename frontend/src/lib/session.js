import { goto } from '$app/navigation';
import { Session } from './api.js';
import { userProfile } from './stores.js';

/**
 * A write failed with 401: the token is dead (expired or revoked). Drop the
 * local session and send the visitor to log in again, preserving where they
 * were so they can return to it. Returns true when it handled the error.
 *
 * api.js already retries once as a guest on a JWT error; whatever comes back
 * after that retry is what reaches this helper.
 */
export function handleAuthFailure(err) {
  if (err?.status !== 401) return false;

  try {
    Session.clear();
  } catch {
    /* nothing else to clear */
  }
  userProfile.set(null);

  const here = `${location.pathname}${location.search}`;
  const next = here.startsWith('/login') ? '/profile' : here;
  goto(`/login?next=${encodeURIComponent(next)}`, { replaceState: true });
  return true;
}
