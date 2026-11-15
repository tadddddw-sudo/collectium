import multer from 'multer';
import crypto from 'crypto';
import { supabase, createAuthClient } from '../supabaseClient.js';
import { sendAuthError } from '../sessions.js';
import { getUserFromToken } from '../authProviders.js';
import { asyncRouter } from '../asyncRouter.js';
import { selectProfile, isUsernameTaken, isMissingColumn } from '../profileQueries.js';
import {
  USERNAME_PATTERN,
  UUID_PATTERN,
  detectImageType,
  pickFields,
  storageFolder,
} from '../validation.js';
import { uploadLimiter, writeLimiter } from '../rateLimits.js';

const router = asyncRouter();

const IMAGE_BUCKET = 'collectibles';
const MAX_FEATURED = 3;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5 },
});

const SETUP_HINT =
  'Profile editing is not set up on the database yet. Run supabase/profile-editing.sql in Supabase.';

/** The fields PATCH /me accepts, and how to check each one. */
const PROFILE_FIELDS = {
  display_name: (v) => v === null || (typeof v === 'string' && v.trim().length <= 50),
  username: (v) => typeof v === 'string' && USERNAME_PATTERN.test(v),
  bio: (v) => v === null || (typeof v === 'string' && v.length <= 500),
  featured_collection_ids: (v) =>
    Array.isArray(v) &&
    v.length <= MAX_FEATURED &&
    new Set(v).size === v.length &&
    v.every((id) => typeof id === 'string' && UUID_PATTERN.test(id)),
};

/** The signed-in user for this request, or null. */
async function currentUser(req) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return null;
  const user = await getUserFromToken(token);
  if (!user) return null;
  return { user, client: createAuthClient(token) };
}

function loadOwnProfile(client, userId) {
  return selectProfile((columns) => client.from('profiles').select(columns).eq('id', userId).single());
}

// GET /api/profiles/:username -> Fetch profile + their binders & display cases
router.get('/:username', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const client = token ? createAuthClient(token) : supabase;

  const { data: profile, error: profileErr } = await selectProfile((columns) =>
    client.from('profiles').select(columns).eq('username', req.params.username).single()
  );

  if (profileErr || !profile) {
    return res.status(404).json({ error: 'Collector profile not found.' });
  }

  const { data: collections, error: colErr } = await client
    .from('collections')
    .select('*, collection_items(id, image_url)')
    .eq('user_id', profile.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (colErr) return sendAuthError(res, colErr);

  res.json({ profile, collections });
});

// PATCH /api/profiles/me -> display name, handle, bio, featured collections
router.patch('/me', writeLimiter, async (req, res) => {
  const auth = await currentUser(req);
  if (!auth) return res.status(401).json({ error: 'Please sign in again.', code: 'AUTH_REQUIRED' });
  const { user, client } = auth;

  const { updates, error: fieldError } = pickFields(req.body, PROFILE_FIELDS);
  if (fieldError) {
    const friendly = {
      username: 'Handle must be 3–30 characters: letters, numbers, dots, dashes or underscores.',
      bio: 'Bio can be at most 500 characters.',
      display_name: 'Display name can be at most 50 characters.',
      featured_collection_ids: `Pick at most ${MAX_FEATURED} different collections to feature.`,
    };
    const field = Object.keys(friendly).find((f) => fieldError.includes(`"${f}"`));
    const isValueError = fieldError.startsWith('Invalid value');
    return res.status(400).json({ error: field && isValueError ? friendly[field] : fieldError });
  }

  if (typeof updates.display_name === 'string') {
    updates.display_name = updates.display_name.trim() || null;
  }
  if (typeof updates.bio === 'string') {
    updates.bio = updates.bio.trim() || null;
  }

  if (updates.username && (await isUsernameTaken(client, updates.username, user.id))) {
    return res.status(400).json({ error: 'That handle is already taken.' });
  }

  // Only the caller's own collections can be featured.
  if (updates.featured_collection_ids?.length) {
    const { data: owned, error: ownErr } = await client
      .from('collections')
      .select('id')
      .eq('user_id', user.id)
      .in('id', updates.featured_collection_ids);
    if (ownErr) return sendAuthError(res, ownErr);
    if (owned.length !== updates.featured_collection_ids.length) {
      return res.status(400).json({ error: 'You can only feature your own collections.' });
    }
  }

  const { error } = await client.from('profiles').update(updates).eq('id', user.id);
  if (error) {
    if (isMissingColumn(error)) return res.status(500).json({ error: SETUP_HINT });
    if (error.code === '23505') return res.status(400).json({ error: 'That handle is already taken.' });
    if (error.code === '23514') return res.status(400).json({ error: 'One of the values is too long.' });
    return sendAuthError(res, error);
  }

  const { data: profile, error: readErr } = await loadOwnProfile(client, user.id);
  if (readErr) return sendAuthError(res, readErr);
  res.json({ profile });
});

/** Storage path inside the bucket for one of our public URLs, or null. */
function storagePathFromUrl(url) {
  const marker = `/storage/v1/object/public/${IMAGE_BUCKET}/`;
  const idx = typeof url === 'string' ? url.indexOf(marker) : -1;
  return idx < 0 ? null : decodeURIComponent(url.slice(idx + marker.length));
}

/** POST /api/profiles/me/avatar and /me/banner -> replace the picture. */
function imageRoute(column) {
  return async (req, res) => {
    const auth = await currentUser(req);
    if (!auth) return res.status(401).json({ error: 'Please sign in again.', code: 'AUTH_REQUIRED' });
    const { user, client } = auth;

    if (!req.file) return res.status(400).json({ error: 'Choose an image first.' });
    const type = detectImageType(req.file.buffer, { allowJpeg: true });
    if (!type) return res.status(400).json({ error: 'Image must be a PNG, JPEG or WebP file.' });

    const { data: before, error: beforeErr } = await loadOwnProfile(client, user.id);
    if (beforeErr) return sendAuthError(res, beforeErr);
    if (!(column in before)) return res.status(500).json({ error: SETUP_HINT });

    // Under <user id>/ so the existing storage policies and account deletion cover it.
    const kind = column === 'avatar_url' ? 'avatar' : 'banner';
    const path = `${storageFolder(user.id)}/profile/${kind}-${crypto.randomUUID()}.${type.ext}`;
    const { error: uploadErr } = await client.storage
      .from(IMAGE_BUCKET)
      .upload(path, req.file.buffer, { contentType: type.mime, upsert: false });
    if (uploadErr) return sendAuthError(res, uploadErr);

    const { data: urlData } = client.storage.from(IMAGE_BUCKET).getPublicUrl(path);
    const { error: updateErr } = await client
      .from('profiles')
      .update({ [column]: urlData.publicUrl })
      .eq('id', user.id);
    if (updateErr) {
      await client.storage.from(IMAGE_BUCKET).remove([path]).catch(() => {});
      if (isMissingColumn(updateErr)) return res.status(500).json({ error: SETUP_HINT });
      return sendAuthError(res, updateErr);
    }

    // Best effort: drop the previous picture if it was one of ours.
    const oldPath = storagePathFromUrl(before[column]);
    if (oldPath && oldPath.startsWith(`${storageFolder(user.id)}/profile/`)) {
      client.storage.from(IMAGE_BUCKET).remove([oldPath]).catch(() => {});
    }

    const { data: profile, error: readErr } = await loadOwnProfile(client, user.id);
    if (readErr) return sendAuthError(res, readErr);
    res.json({ profile });
  };
}

/** DELETE /api/profiles/me/avatar and /me/banner -> back to the default look. */
function clearImageRoute(column) {
  return async (req, res) => {
    const auth = await currentUser(req);
    if (!auth) return res.status(401).json({ error: 'Please sign in again.', code: 'AUTH_REQUIRED' });
    const { user, client } = auth;

    const { data: before, error: beforeErr } = await loadOwnProfile(client, user.id);
    if (beforeErr) return sendAuthError(res, beforeErr);
    if (!(column in before)) return res.status(500).json({ error: SETUP_HINT });

    const { error } = await client.from('profiles').update({ [column]: null }).eq('id', user.id);
    if (error) return sendAuthError(res, error);

    const oldPath = storagePathFromUrl(before[column]);
    if (oldPath && oldPath.startsWith(`${storageFolder(user.id)}/profile/`)) {
      client.storage.from(IMAGE_BUCKET).remove([oldPath]).catch(() => {});
    }

    const { data: profile, error: readErr } = await loadOwnProfile(client, user.id);
    if (readErr) return sendAuthError(res, readErr);
    res.json({ profile });
  };
}

router.post('/me/avatar', uploadLimiter, upload.single('image'), imageRoute('avatar_url'));
router.post('/me/banner', uploadLimiter, upload.single('image'), imageRoute('banner_url'));
router.delete('/me/avatar', writeLimiter, clearImageRoute('avatar_url'));
router.delete('/me/banner', writeLimiter, clearImageRoute('banner_url'));

export default router;
