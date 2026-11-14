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

// Public/anonymous client for unauthenticated reads & auth calls
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Creates a scoped client acting on behalf of a logged-in user (enforces RLS)
export function createAuthClient(accessToken) {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY,
    {
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    }
  );
}

// A throwaway anon client with no stored session, for one-off auth checks
// (e.g. re-verifying a password) that must not touch the shared client's state.
export function createIsolatedClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
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
