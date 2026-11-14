import express from 'express';
import { supabase, createAuthClient, createIsolatedClient } from '../supabaseClient.js';
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

// Password policy: 8+ characters, a digit, an uppercase letter and a special character.
// Keep in sync with src/lib/password.js (used for the signup form hints).
function passwordPolicyError(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (!/[0-9]/.test(password)) return 'Password must contain a number.';
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter.';
  if (!/[^A-Za-z0-9\s]/.test(password)) return 'Password must contain a special character.';
  return null;
}

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  const { username, email, password } = req.body;

  if (req.body.accepted_terms !== true) {
    return res
      .status(400)
      .json({ error: 'You need to accept the Terms of Service and Privacy Policy.' });
  }

  const passwordError = passwordPolicyError(password);
  if (passwordError) return res.status(400).json({ error: passwordError });

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
    // Record when the user accepted the Terms and Privacy Policy (stored in auth user metadata).
    options: { data: { username, legal_accepted_at: new Date().toISOString() } },
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

  // Bearer clients (scripts, native apps) get a cookie session too, so they can
  // switch to the browser without signing in again.
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

const IMAGE_BUCKET = 'collectibles';
const LIST_PAGE = 1000;

/** Every object path under `<userId>/` in the image bucket (uploads live at <userId>/<collectionId>/<file>). */
async function listUserImagePaths(client, userId) {
  const listAll = async (prefix) => {
    const entries = [];
    for (let offset = 0; ; offset += LIST_PAGE) {
      const { data, error } = await client.storage
        .from(IMAGE_BUCKET)
        .list(prefix, { limit: LIST_PAGE, offset });
      if (error) throw error;
      entries.push(...data);
      if (data.length < LIST_PAGE) return entries;
    }
  };

  const paths = [];
  for (const entry of await listAll(userId)) {
    const entryPath = `${userId}/${entry.name}`;
    if (entry.id) {
      paths.push(entryPath); // a file directly under the user folder
    } else {
      for (const file of await listAll(entryPath)) {
        if (file.id) paths.push(`${entryPath}/${file.name}`);
      }
    }
  }
  return paths;
}

// DELETE /api/auth/account -> permanently delete the signed-in user's account, data and images
router.delete('/account', async (req, res) => {
  const token = req.accessToken;
  if (!token) {
    return res.status(401).json({ error: 'Please sign in again.', code: 'AUTH_REQUIRED' });
  }

  const { password } = req.body || {};
  if (typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'Enter your password to confirm.' });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) {
    clearSessionCookies(res);
    return res.status(401).json({ error: 'Session expired. Please sign in again.', code: 'AUTH_REQUIRED' });
  }

  // Re-check the password so a stolen or forgotten-open session can't delete the account.
  // A separate client keeps the shared anon client's session state untouched.
  const { error: verifyError } = await createIsolatedClient().auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (verifyError) return res.status(403).json({ error: 'Password is incorrect.' });

  const userClient = createAuthClient(token);

  // 1. Images. Storage files are not removed by deleting database rows, so remove them first.
  try {
    const paths = await listUserImagePaths(userClient, user.id);
    if (paths.length) {
      const { data: removed, error: removeError } = await userClient.storage
        .from(IMAGE_BUCKET)
        .remove(paths);
      if (removeError) throw removeError;
      // Without a storage DELETE policy, Supabase silently removes nothing.
      if ((removed?.length ?? 0) < paths.length) {
        throw new Error(`only ${removed?.length ?? 0} of ${paths.length} images could be removed`);
      }
    }
  } catch (err) {
    console.error('[DELETE /auth/account] image cleanup failed:', err.message);
    return res.status(500).json({
      error:
        'Could not delete your images, so the account was not deleted. ' +
        'The storage delete policy from supabase/account-deletion.sql may be missing.',
    });
  }

  // 2. Rows + auth user, in one transaction inside the SQL function.
  const { error: deleteError } = await userClient.rpc('delete_my_account');
  if (deleteError) {
    console.error('[DELETE /auth/account] delete_my_account failed:', deleteError);
    return res.status(500).json({
      error:
        deleteError.code === 'PGRST202'
          ? 'Account deletion is not set up on the database yet. Run supabase/account-deletion.sql in Supabase.'
          : 'Could not delete the account. Please try again.',
    });
  }

  clearSessionCookies(res);
  res.json({ success: true });
});

export default router;
