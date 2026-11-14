import express from 'express';
import { supabase, createAuthClient } from '../supabaseClient.js';
import {
  clearSessionCookies,
  setSessionCookies,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
} from '../sessions.js';

const router = express.Router();

const PROFILE_COLUMNS = 'id, username, display_name, bio, avatar_url, created_at';

async function loadProfile(accessToken, userId) {
  const userSupabase = createAuthClient(accessToken);
  return userSupabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).single();
}

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  const { username, email, password } = req.body;

  const { data: existing } = await supabase
    .from('profiles')
    .select('username')
    .eq('username', username)
    .maybeSingle();

  if (existing) {
    return res.status(400).json({ error: 'Username is already taken.' });
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ user: data.user });
});

// POST /api/auth/login -> JSON for API clients, httpOnly cookies for the SPA
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError) return res.status(401).json({ error: authError.message });

  const { data: profile, error: profileError } = await loadProfile(
    authData.session.access_token,
    authData.user.id
  );

  if (profileError) {
    // Auth worked but there is no Collectium profile row (e.g. trigger failed).
    return res.status(400).json({
      error:
        'Signed in, but this account has no Collectium profile. Ask an admin to create the profiles row for it.',
    });
  }

  // The SPA never sees the token: it rides in an httpOnly cookie.
  setSessionCookies(res, authData.session);

  res.json({
    user: authData.user,
    session: authData.session,
    profile,
  });
});

// GET /api/auth/me -> the signed-in profile, or `{ profile: null }` for a guest
router.get('/me', async (req, res) => {
  const token = req.accessToken || req.cookies?.[ACCESS_COOKIE];
  if (!token) return res.json({ profile: null });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) {
    clearSessionCookies(res);
    return res.json({ profile: null });
  }

  const { data: profile, error: profileError } = await loadProfile(token, user.id);
  if (profileError || !profile) {
    return res.json({ profile: null });
  }

  // Legacy clients (public/*.html) authenticate with a bearer header. Give them
  // a cookie session too, so migrating to the SPA does not force a re-login.
  if (!req.cookies?.[ACCESS_COOKIE]) {
    setSessionCookies(res, { access_token: token, expires_in: 3600 });
  }

  res.json({ profile });
});

// POST /api/auth/logout -> revoke the session and drop the cookies
router.post('/logout', async (req, res) => {
  const token = req.accessToken || req.cookies?.[ACCESS_COOKIE];
  const refreshToken = req.cookies?.[REFRESH_COOKIE];

  if (token && refreshToken) {
    // Best effort: revoke the refresh token server-side. Clearing the cookies
    // below is what actually signs the browser out, so failure is not fatal.
    try {
      const client = createAuthClient(token);
      await client.auth.setSession({ access_token: token, refresh_token: refreshToken });
      await client.auth.signOut();
    } catch {
      /* revoked already, or offline */
    }
  }

  clearSessionCookies(res);
  res.json({ success: true });
});

export default router;
