import { get, writable } from 'svelte/store';

/** Current user profile, or null for a guest. Populated once in +layout.svelte. */
export const userProfile = writable(null);

let ready = false;
let resolveAuth;
const authPromise = new Promise((resolve) => {
  resolveAuth = resolve;
});

/**
 * Called exactly once by +layout.svelte after the session probe finishes.
 * Pages await waitForAuth() before deciding owner vs guest so they never race it.
 */
export function markAuthReady(profile) {
  ready = true;
  userProfile.set(profile ?? null);
  resolveAuth(profile ?? null);
}

/**
 * Resolves with the session. After the first probe it resolves immediately with
 * the store's current value, so a page mounted right after login still sees the
 * signed-in profile rather than the guest snapshot taken at app boot.
 */
export function waitForAuth() {
  if (ready) return Promise.resolve(get(userProfile));
  return authPromise;
}
