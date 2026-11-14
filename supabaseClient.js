import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Load .env next to this file, not the shell's current directory, so
// `node index.js` behaves the same from any folder.
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '.env') });

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  console.error(
    [
      '',
      'Missing backend configuration.',
      `Expected ${path.join(here, '.env')} to define:`,
      '  SUPABASE_URL=...',
      '  SUPABASE_KEY=...',
      '  PORT=5000',
      '',
      'Copy .env.example if it exists, or create the file with those three lines.',
      '',
    ].join('\n')
  );
  process.exit(1);
}

// The server is shared by every visitor, so no client may keep a session
// between requests. Timers for auto-refresh would also leak per request.
const SERVER_AUTH_OPTIONS = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
};

// Public/anonymous client for unauthenticated reads and stateless checks such as
// `auth.getUser(token)`.
//
// NEVER call a session-creating method on it (signInWithPassword, signUp,
// refreshSession, setSession, verifyOtp, ...). Supabase keeps the resulting
// session in memory even with persistSession: false, and every later query on
// this client would then run as that user. Use createIsolatedClient() instead.
export const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
  auth: SERVER_AUTH_OPTIONS,
});

// Creates a scoped client acting on behalf of a logged-in user (enforces RLS)
export function createAuthClient(accessToken) {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
    auth: SERVER_AUTH_OPTIONS,
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}

// A throwaway anon client for one request's auth flow (sign in, sign up,
// refresh, password reset). Its session dies with the request.
export function createIsolatedClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
    auth: SERVER_AUTH_OPTIONS,
  });
}

// A tiny helper — put in supabaseClient.js or a new util
export function isAuthError(error) {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  return (
    error.code === 'PGRST301' ||          // JWT expired / invalid in PostgREST
    error.code === 'PGRST302' ||          // anonymous access disabled
    msg.includes('jwt expired') ||
    msg.includes('jwt invalid') ||
    msg.includes('invalid claim') ||
    msg.includes('token is expired')
  );
}
