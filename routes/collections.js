import multer from 'multer';
import crypto from 'crypto';
import { supabase, createAuthClient } from '../supabaseClient.js';
import { sendAuthError } from '../sessions.js';
import { getUserFromToken } from '../authProviders.js';
import { asyncRouter } from '../asyncRouter.js';
import { uploadLimiter, writeLimiter } from '../rateLimits.js';
import {
  pickFields,
  isPlainObject,
  parseJsonField,
  detectImageType,
  UUID_PATTERN,
} from '../validation.js';

const router = asyncRouter();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 20, fieldSize: 16 * 1024 },
});

const COLLECTION_TYPES = ['binder', 'display_case'];

/** The fields a client may set on a collection, and how to check each one. */
const COLLECTION_FIELDS = {
  title: (v) => typeof v === 'string' && v.trim().length > 0 && v.length <= 120,
  description: (v) => typeof v === 'string' && v.length <= 2000,
  layout_config: isPlainObject,
  is_public: (v) => typeof v === 'boolean',
  sort_order: Number.isInteger,
};

// GET /api/collections/:id -> Fetch single binder/display case + all its items
router.get('/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const client = token ? createAuthClient(token) : supabase;

  if (!UUID_PATTERN.test(req.params.id)) {
    return res.status(404).json({ error: 'Collection not found.' });
  }

  const { data: collection, error } = await client
    .from('collections')
    .select('*, profiles(username, display_name), collection_items(*)')
    .eq('id', req.params.id)
    .single();

  if (error) {
    // PGRST116 = "0 or >1 rows" (RLS filtered it out). Everything else is a real failure.
    if (error.code === 'PGRST116') {
      return res.status(404).json({ error: 'Collection not found.' });
    }
    console.error('[GET /collections/:id] supabase error:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      token: !!token,
    });
    return res.status(500).json({ error: 'Could not load the collection.', code: error.code });
  }
  if (!collection) {
    return res.status(404).json({ error: 'Collection not found.' });
  }

  res.json({ collection });
});

// POST /api/collections -> Create a new Binder or Display Case
router.post('/', writeLimiter, async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const userSupabase = createAuthClient(token);
  const user = await getUserFromToken(token);
  if (!user) return res.status(401).json({ error: 'Invalid token' });

  const { title, description, type, layout_config, is_public } = req.body || {};

  if (!COLLECTION_TYPES.includes(type)) {
    return res.status(400).json({ error: 'Type must be "binder" or "display_case".' });
  }
  if (!COLLECTION_FIELDS.title(title)) {
    return res.status(400).json({ error: 'Title is required (up to 120 characters).' });
  }
  if (description !== undefined && !COLLECTION_FIELDS.description(description)) {
    return res.status(400).json({ error: 'Description must be text up to 2000 characters.' });
  }
  if (layout_config !== undefined && !isPlainObject(layout_config)) {
    return res.status(400).json({ error: 'layout_config must be an object.' });
  }
  if (is_public !== undefined && typeof is_public !== 'boolean') {
    return res.status(400).json({ error: 'is_public must be true or false.' });
  }

  const defaultLayout =
    type === 'binder'
      ? { pages: 4, rows: 3, cols: 3, show_grid: true }
      : { theme: 'glass_shelf' };

  const { data, error } = await userSupabase
    .from('collections')
    .insert({
      user_id: user.id,
      title,
      description: description || '',
      type,
      layout_config: layout_config || defaultLayout,
      is_public: is_public !== undefined ? is_public : true,
    })
    .select()
    .single();

  if (error) return sendAuthError(res, error);
  res.status(201).json({ collection: data });
});

// PATCH /api/collections/:id -> Update grid dimensions, page count, toggle grid, or title
router.patch('/:id', writeLimiter, async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  // Only listed fields: never let a client rewrite id, user_id, created_at...
  const { updates, error: fieldError } = pickFields(req.body, COLLECTION_FIELDS);
  if (fieldError) return res.status(400).json({ error: fieldError });

  const userSupabase = createAuthClient(token);
  const { data, error } = await userSupabase
    .from('collections')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return sendAuthError(res, error);
  res.json({ collection: data });
});

// DELETE /api/collections/:id
router.delete('/:id', writeLimiter, async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const userSupabase = createAuthClient(token);
  const { error } = await userSupabase
    .from('collections')
    .delete()
    .eq('id', req.params.id);

  if (error) return sendAuthError(res, error);
  res.json({ success: true });
});

// POST /api/collections/:id/items -> Upload transparent PNG + create slot/case item
router.post('/:id/items', uploadLimiter, upload.single('image'), async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  if (!req.file) return res.status(400).json({ error: 'Image file is required.' });

  const collectionId = req.params.id;
  if (!UUID_PATTERN.test(collectionId)) {
    return res.status(404).json({ error: 'Collection not found.' });
  }

  const imageType = detectImageType(req.file.buffer);
  if (!imageType) return res.status(400).json({ error: 'Image must be a PNG or WebP file.' });

  const { name, description, page_number, slot_index } = req.body;
  const positionData = parseJsonField(req.body.position_data);
  if (positionData === undefined) {
    return res.status(400).json({ error: 'position_data must be a JSON object.' });
  }

  const userSupabase = createAuthClient(token);
  const user = await getUserFromToken(token);
  if (!user) return res.status(401).json({ error: 'Invalid token' });

  // Upload only into a collection the caller owns, so nobody can attach items
  // to someone else's binder (or fill storage under someone else's collection id).
  const { data: owned, error: ownErr } = await userSupabase
    .from('collections')
    .select('id')
    .eq('id', collectionId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (ownErr) return sendAuthError(res, ownErr);
  if (!owned) return res.status(404).json({ error: 'Collection not found.' });

  const filePath = `${user.id}/${collectionId}/${crypto.randomUUID()}.${imageType.ext}`;

  const { error: uploadErr } = await userSupabase.storage
    .from('collectibles')
    .upload(filePath, req.file.buffer, {
      contentType: imageType.mime,
      upsert: false,
    });

  if (uploadErr) return sendAuthError(res, uploadErr);

  const { data: urlData } = userSupabase.storage
    .from('collectibles')
    .getPublicUrl(filePath);

  const { data: item, error: dbErr } = await userSupabase
    .from('collection_items')
    .insert({
      collection_id: collectionId,
      user_id: user.id,
      name: typeof name === 'string' && name.trim() ? name.slice(0, 120) : 'Untitled Item',
      description: typeof description === 'string' ? description.slice(0, 2000) : '',
      image_url: urlData.publicUrl,
      page_number: Number.isInteger(Number(page_number)) && Number(page_number) > 0 ? Number(page_number) : 1,
      slot_index:
        slot_index !== undefined && slot_index !== '' && Number.isInteger(Number(slot_index))
          ? Number(slot_index)
          : null,
      position_data: positionData ?? { x: 50, y: 50, scale: 1, z_index: 1 },
    })
    .select()
    .single();

  if (dbErr) return sendAuthError(res, dbErr);
  res.status(201).json({ item });
});

export default router;
