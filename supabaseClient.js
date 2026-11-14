import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

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
