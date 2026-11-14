import { writable } from 'svelte/store';

/**
 * Light / dark theme.
 *
 * The choice is kept in localStorage (a preference the visitor sets, not a
 * cookie, and never sent to the server). With no saved choice the theme
 * follows the operating system. src/app.html applies it before first paint so
 * the page doesn't flash the wrong colours; keep the key in sync there.
 */
export const THEME_KEY = 'collectium-theme';

function initialTheme() {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export const theme = writable(initialTheme());

export function setTheme(next) {
  const value = next === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = value;
  try {
    localStorage.setItem(THEME_KEY, value);
  } catch {
    /* storage blocked: the choice lasts until the tab closes */
  }
  theme.set(value);
}

export function toggleTheme() {
  setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
}
