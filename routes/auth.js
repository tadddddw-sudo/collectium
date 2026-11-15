import crypto from 'node:crypto';
import { supabase, createAuthClient, createIsolatedClient } from '../supabaseClient.js';
import { asyncRouter } from '../asyncRouter.js';
import { selectProfile, isUsernameTaken } from '../profileQueries.js';
import { USERNAME_PATTERN } from '../validation.js';
import {
  clearSessionCookies,
  setSessionCookies,
  decodeJwtPayload,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  PROVIDER_COOKIE,
} from '../sessions.js';
import {
  auth0Enabled,
  authorizeUrl,
  canDeleteAuth0Users,
  deleteAuth0User,
  exchangeCode,
  fetchUserInfo,
  getUserFromToken,
  logoutUrl,
  newPkce,
  revokeAuth0RefreshToken,
  verifyAuth0Token,
} from '../authProviders.js';
import {
  loginIpLimiter,
  loginAccountLimiter,
  signupLimiter,
  forgotPasswordIpLimiter,
  forgotPasswordEmailLimiter,
  resetPasswordLimiter,
  sensitiveActionLimiter,
} from '../rateLimits.js';

const router = asyncRouter();

async function loadProfile(accessToken, userId) {
  const userSupabase = createAuthClient(accessToken);
  return selectProfile((columns) =>
    userSupabase.from('profiles').select(columns).eq('id', userId).single()
  );
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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanEmail(email) {
  if (typeof email !== 'string') return null;
  const trimmed = email.trim();
  return trimmed.length <= 254 && EMAIL_PATTERN.test(trimmed) ? trimmed : null;
}

/**
 * Where the reset email should send people. Taken from APP_URL, never from the
 * request's Host header: a forged Host would otherwise make Supabase email a
 * link to an attacker's site (as long as it is on the redirect allow list).
 */
function appUrl(pathname) {
  if (!process.env.APP_URL) return undefined;
  try {
    return new URL(pathname, process.env.APP_URL).toString();
  } catch {
    console.error('APP_URL is not a valid URL; auth emails will link to the Supabase Site URL.');
    return undefined;
  }
}

const passwordResetRedirect = () => appUrl('/reset-password');
// Confirmation links land on the login page, which says the email is confirmed.
const confirmEmailRedirect = () => appUrl('/login?confirmed=1');

// POST /api/auth/signup
router.post('/signup', signupLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  const email = cleanEmail(req.body?.email);

  if (req.body?.accepted_terms !== true) {
    return res
      .status(400)
      .json({ error: 'You need to accept the Terms of Service and Privacy Policy.' });
  }

  if (typeof username !== 'string' || !USERNAME_PATTERN.test(username)) {
    return res.status(400).json({
      error: 'Username must be 3–30 characters: letters, numbers, dots, dashes or underscores.',
    });
  }
  if (!email) return res.status(400).json({ error: 'Enter a valid email address.' });

  const passwordError = passwordPolicyError(password);
  if (passwordError) return res.status(400).json({ error: passwordError });

  if (await isUsernameTaken(supabase, username)) {
    return res.status(400).json({ error: 'Username is already taken.' });
  }

  const { data, error } = await createIsolatedClient().auth.signUp({
    email,
    password,
    options: {
      // Record when the user accepted the Terms and Privacy Policy (stored in auth user metadata).
      data: { username, legal_accepted_at: new Date().toISOString() },
      emailRedirectTo: confirmEmailRedirect(),
    },
  });

  if (error) return res.status(400).json({ error: error.message });
  // With "Confirm email" on in Supabase there is no session until the link is clicked.
  res.status(201).json({ user: data.user, needs_confirmation: !data.session });
});

// POST /api/auth/resend-confirmation { email } -> send the signup confirmation email again
router.post(
  '/resend-confirmation',
  forgotPasswordIpLimiter,
  forgotPasswordEmailLimiter,
  async (req, res) => {
    const email = cleanEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: 'Enter a valid email address.' });

    const { error } = await createIsolatedClient().auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: confirmEmailRedirect() },
    });
    if (error) {
      console.error('[POST /auth/resend-confirmation] Supabase error:', error.status, error.message);
    }
    // Same answer either way, so this can't reveal which emails are registered.
    res.json({
      success: true,
      message: 'If that account is waiting for confirmation, a new email is on its way.',
    });
  }
);

// POST /api/auth/login -> JSON for API clients, httpOnly cookies for the SPA
router.post('/login', loginIpLimiter, loginAccountLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  const remember = req.body?.remember === true;
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return res.status(400).json({ error: 'Enter your email and password.' });
  }

  // A fresh client per login. Signing in on the shared client would make every
  // later guest request on this server run as this user.
  const { data: authData, error: authError } = await createIsolatedClient().auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (authError) {
    if (authError.code === 'email_not_confirmed') {
      return res.status(401).json({
        error: 'Confirm your email address first. Check your inbox for the link.',
        code: 'EMAIL_NOT_CONFIRMED',
      });
    }
    return res.status(401).json({ error: authError.message });
  }

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

  // Browsers get the session in httpOnly cookies. The JSON copy is for
  // non-browser API clients that send it back as a bearer token.
  setSessionCookies(res, authData.session, { remember });

  res.json({
    user: authData.user,
    session: authData.session,
    profile: { ...profile, auth_provider: 'supabase' },
  });
});

// GET /api/auth/me -> the signed-in profile, or `{ profile: null }` for a guest
router.get('/me', async (req, res) => {
  const token = req.accessToken || req.cookies?.[ACCESS_COOKIE];
  if (!token) return res.json({ profile: null });

  const user = await getUserFromToken(token);
  if (!user) {
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
    setSessionCookies(res, { access_token: token, expires_in: 3600 }, { provider: user.provider });
  }

  res.json({ profile: { ...profile, auth_provider: user.provider } });
});

// POST /api/auth/logout -> revoke the session and drop the cookies.
// Auth0 sessions also answer with `redirect`: the browser should visit it to end
// the Auth0 single sign-on session, or "Continue with Google" would sign
// straight back in.
router.post('/logout', async (req, res) => {
  const token = req.accessToken || req.cookies?.[ACCESS_COOKIE];
  const refreshToken = req.cookies?.[REFRESH_COOKIE];

  if (req.cookies?.[PROVIDER_COOKIE] === 'auth0') {
    await revokeAuth0RefreshToken(refreshToken);
    clearSessionCookies(res);
    const redirect = auth0Enabled() ? logoutUrl(new URL('/login', process.env.APP_URL).toString()) : undefined;
    return res.json({ success: true, redirect });
  }

  if (token && refreshToken) {
    // Best effort: revoke the refresh token server-side. Clearing the cookies
    // below is what actually signs the browser out, so failure is not fatal.
    try {
      const client = createIsolatedClient();
      await client.auth.setSession({ access_token: token, refresh_token: refreshToken });
      await client.auth.signOut();
    } catch {
      /* revoked already, or offline */
    }
  }

  clearSessionCookies(res);
  res.json({ success: true });
});

// POST /api/auth/forgot-password { email } -> email a reset link
//
// Always answers the same way, whether or not the address has an account, so
// this endpoint can't be used to find out who is registered.
router.post(
  '/forgot-password',
  forgotPasswordIpLimiter,
  forgotPasswordEmailLimiter,
  async (req, res) => {
    const email = cleanEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: 'Enter a valid email address.' });

    const { error } = await createIsolatedClient().auth.resetPasswordForEmail(email, {
      redirectTo: passwordResetRedirect(),
    });
    if (error) {
      // Log it (e.g. Supabase's own email rate limit, SMTP problems) but don't
      // tell the caller anything that depends on the account.
      console.error('[POST /auth/forgot-password] Supabase error:', error.status, error.message);
    }

    res.json({
      success: true,
      message: 'If an account exists for that email, a password reset link is on its way.',
    });
  }
);

// How long after clicking the email link the user has to choose a new password.
const RECOVERY_WINDOW_SECONDS = 60 * 60;

/** True when the access token came from a password-recovery link clicked within the window. */
function isFreshRecoverySession(accessToken) {
  const amr = decodeJwtPayload(accessToken)?.amr;
  if (!Array.isArray(amr)) return false;
  const now = Math.floor(Date.now() / 1000);
  return amr.some(
    (entry) =>
      (entry?.method === 'recovery' || entry?.method === 'otp') &&
      Number(entry.timestamp) > now - RECOVERY_WINDOW_SECONDS
  );
}

// POST /api/auth/reset-password -> set a new password from a reset link
//
// Body: { password, token_hash }                  (custom email template, ?token_hash=...)
//   or: { password, access_token, refresh_token } (default template, #access_token=...)
router.post('/reset-password', resetPasswordLimiter, async (req, res) => {
  const { password, token_hash: tokenHash, access_token: accessToken, refresh_token: refreshToken } =
    req.body || {};
  const invalidLink = () =>
    res.status(400).json({
      error: 'This reset link is invalid or has expired. Request a new one.',
      code: 'INVALID_RESET_LINK',
    });

  const passwordError = passwordPolicyError(password);
  if (passwordError) return res.status(400).json({ error: passwordError });

  const client = createIsolatedClient();

  if (typeof tokenHash === 'string' && tokenHash) {
    const { data, error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
    if (error || !data?.session) return invalidLink();
  } else if (typeof accessToken === 'string' && typeof refreshToken === 'string') {
    // setSession validates the token with Supabase before we trust its claims.
    const { data, error } = await client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error || !data?.session) return invalidLink();
    // Only a session from the reset email may set a password without the old
    // one. A normal (e.g. stolen) login session must not.
    if (!isFreshRecoverySession(data.session.access_token)) return invalidLink();
  } else {
    return invalidLink();
  }

  const { error: updateError } = await client.auth.updateUser({ password });
  if (updateError) {
    // e.g. "New password should be different from the old password."
    return res.status(400).json({ error: updateError.message });
  }

  // Sign out every device, including whoever may have been using the old
  // password, and the recovery session itself.
  try {
    await client.auth.signOut({ scope: 'global' });
  } catch (err) {
    console.error('[POST /auth/reset-password] global sign-out failed:', err.message);
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
router.delete('/account', sensitiveActionLimiter, async (req, res) => {
  const token = req.accessToken;
  if (!token) {
    return res.status(401).json({ error: 'Please sign in again.', code: 'AUTH_REQUIRED' });
  }

  const user = await getUserFromToken(token);
  if (!user) {
    clearSessionCookies(res);
    return res.status(401).json({ error: 'Session expired. Please sign in again.', code: 'AUTH_REQUIRED' });
  }

  if (user.provider === 'auth0') {
    // No password to check. Typing the handle guards against a stray click.
    const { data: own } = await loadProfile(token, user.id);
    const typed = req.body?.confirm_username;
    if (!own || typeof typed !== 'string' || typed.trim().toLowerCase() !== own.username.toLowerCase()) {
      return res.status(400).json({ error: 'Type your username to confirm.' });
    }
  } else {
    const { password } = req.body || {};
    if (typeof password !== 'string' || !password) {
      return res.status(400).json({ error: 'Enter your password to confirm.' });
    }

    // Re-check the password so a stolen or forgotten-open session can't delete the account.
    // A separate client keeps the shared anon client's session state untouched.
    const verifyClient = createIsolatedClient();
    const { error: verifyError } = await verifyClient.auth.signInWithPassword({
      email: user.email,
      password,
    });
    if (verifyError) return res.status(403).json({ error: 'Password is incorrect.' });
    // That check created a session of its own; don't leave it lying around.
    // scope 'local' revokes only that session, not the user's other devices.
    verifyClient.auth.signOut({ scope: 'local' }).catch(() => {});
  }

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

  // 3. The Auth0 account itself. The data is already gone, so a failure here is
  //    logged, not shown: the person can no longer reach anything of theirs.
  if (user.provider === 'auth0') {
    if (canDeleteAuth0Users()) {
      try {
        await deleteAuth0User(user.id);
      } catch (err) {
        console.error('[DELETE /auth/account] Auth0 user delete failed:', err.message);
      }
    } else {
      console.warn(
        '[DELETE /auth/account] AUTH0_MGMT_CLIENT_ID/SECRET not set: the Auth0 user was left in place.'
      );
    }
  }

  clearSessionCookies(res);
  res.json({ success: true });
});

// ---- "Continue with Google" (through Auth0) -------------------------------------------

const OAUTH_COOKIE = 'collectium_oauth';
const OAUTH_COOKIE_PATH = '/api/auth/auth0';

const oauthCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax', // the return from Auth0 is a top-level GET, which lax allows
  path: OAUTH_COOKIE_PATH,
  secure: process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false',
  maxAge: 10 * 60 * 1000,
});

/** Same-site paths only ("/x"), never "//host" or "https://host". */
function safeNextPath(next) {
  return typeof next === 'string' && /^\/(?![/\\])/.test(next) && next.length <= 500 ? next : null;
}

// GET /api/auth/providers -> whether the login page should show "Continue with Google"
router.get('/providers', (req, res) => {
  res.json({ google: auth0Enabled() });
});

// GET /api/auth/auth0/login?remember=1&next=/x -> off to Google (through Auth0)
router.get('/auth0/login', loginIpLimiter, (req, res) => {
  if (!auth0Enabled()) return res.redirect('/login?error=auth0_unavailable');

  const { verifier, challenge } = newPkce();
  const state = crypto.randomBytes(24).toString('base64url');
  const flow = {
    state,
    verifier,
    next: safeNextPath(req.query.next),
    remember: req.query.remember === '1',
  };

  res.cookie(OAUTH_COOKIE, Buffer.from(JSON.stringify(flow)).toString('base64url'), oauthCookieOptions());
  res.redirect(authorizeUrl({ state, challenge }));
});

function readOauthCookie(req) {
  try {
    return JSON.parse(Buffer.from(req.cookies?.[OAUTH_COOKIE] || '', 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function sameString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** A handle for a new Auth0 user: from their nickname or email, made unique. */
async function pickUsername(info) {
  const raw = String(info.nickname || info.email?.split('@')[0] || '');
  let base = raw.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 22);
  if (base.length < 3) base = 'user';
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = attempt === 0 ? base : `${base}_${crypto.randomBytes(3).toString('hex')}`;
    if (!(await isUsernameTaken(supabase, candidate))) return candidate;
  }
  return `user_${crypto.randomBytes(6).toString('hex')}`;
}

/** The signed-in Auth0 user's profile, created on first sign-in. */
async function ensureAuth0Profile(accessToken, userId, info) {
  const first = await loadProfile(accessToken, userId);
  if (first.data) return first.data;

  const client = createAuthClient(accessToken);
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await client.from('profiles').insert({
      id: userId,
      username: await pickUsername(info),
      display_name: typeof info.name === 'string' && info.name.trim() ? info.name.trim().slice(0, 50) : null,
    });
    if (!error) break;
    if (error.code !== '23505') throw error; // unique violation: handle or id taken, try again
  }

  const { data, error } = await loadProfile(accessToken, userId);
  if (error || !data) throw error || new Error('profile was not created');
  return data;
}

// GET /api/auth/auth0/callback -> Auth0 sends the browser back here with ?code=&state=
router.get('/auth0/callback', loginIpLimiter, async (req, res) => {
  const flow = readOauthCookie(req);
  res.clearCookie(OAUTH_COOKIE, { path: OAUTH_COOKIE_PATH });
  const fail = (code) => res.redirect(`/login?error=${code}`);

  if (!auth0Enabled()) return fail('auth0_unavailable');
  // The user cancelled, or Auth0 refused (e.g. an Action denied access).
  if (req.query.error) return fail('auth0_denied');
  if (!flow || !sameString(flow.state, req.query.state) || typeof req.query.code !== 'string') {
    return fail('auth0_failed');
  }

  try {
    const tokens = await exchangeCode(req.query.code, flow.verifier);
    const claims = await verifyAuth0Token(tokens.access_token);
    if (!claims) return fail('auth0_failed');

    const info = await fetchUserInfo(tokens.access_token);
    const profile = await ensureAuth0Profile(tokens.access_token, claims.sub, info);

    setSessionCookies(res, tokens, { remember: flow.remember === true, provider: 'auth0' });
    res.redirect(safeNextPath(flow.next) || `/profile?u=${encodeURIComponent(profile.username)}`);
  } catch (err) {
    console.error('[GET /auth/auth0/callback]', err?.message || err);
    fail('auth0_failed');
  }
});

export default router;
