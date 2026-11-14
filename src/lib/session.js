import { goto } from '$app/navigation';
import { userProfile } from './stores.js';

/**
 * A write failed with 401: the session cookie is dead (expired or revoked).
 * Drop the local profile and send the visitor to log in again, preserving where
 * they were so they can return to it. Returns true when it handled the error.
 */
export function handleAuthFailure(err) {
  if (err?.status !== 401) return false;

  userProfile.set(null);

  const here = `${location.pathname}${location.search}`;
  const next = here.startsWith('/login') ? '/profile' : here;
  goto(`/login?next=${encodeURIComponent(next)}`, { replaceState: true });
  return true;
}
