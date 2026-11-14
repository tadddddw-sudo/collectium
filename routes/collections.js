import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { supabase, createAuthClient } from '../supabaseClient.js';
import { sendAuthError } from '../sessions.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// GET /api/collections/:id -> Fetch single binder/display case + all its items
router.get('/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const client = token ? createAuthClient(token) : supabase;

  const { data: collection, error } = await client
    .from('collections')
    .select('*, profiles(username, display_name), collection_items(*)')
    .eq('id', req.params.id)
    .single();

  if (error) {
    // Surface the REAL error — this tells you which of the 5 causes it is.
    console.error('[GET /collections/:id] supabase error:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      token: !!token,
    });
    // PGRST116 = "0 or >1 rows" (RLS filtered it out). Everything else is a real failure.
    if (error.code === 'PGRST116') {
      return res.status(404).json({ error: 'Collection not found.' });
    }
    return res.status(500).json({ error: error.message, code: error.code });
  }
  if (!collection) {
    return res.status(404).json({ error: 'Collection not found.' });
  }

  res.json({ collection });
});

// POST /api/collections -> Create a new Binder or Display Case
router.post('/', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const userSupabase = createAuthClient(token);
  const { data: { user }, error: authErr } = await userSupabase.auth.getUser();
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  const { title, description, type, layout_config, is_public } = req.body;

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
router.patch('/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const userSupabase = createAuthClient(token);
  const updates = { ...req.body, updated_at: new Date().toISOString() };

  const { data, error } = await userSupabase
    .from('collections')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return sendAuthError(res, error);
  res.json({ collection: data });
});

// DELETE /api/collections/:id
router.delete('/:id', async (req, res) => {
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
router.post('/:id/items', upload.single('image'), async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  if (!req.file) return res.status(400).json({ error: 'Image file is required.' });

  const userSupabase = createAuthClient(token);
  const { data: { user }, error: authErr } = await userSupabase.auth.getUser();
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  const collectionId = req.params.id;
  const { name, description, page_number, slot_index, position_data } = req.body;

  const fileExt = req.file.mimetype === 'image/webp' ? 'webp' : 'png';
  const filePath = `${user.id}/${collectionId}/${crypto.randomUUID()}.${fileExt}`;

  const { error: uploadErr } = await userSupabase.storage
    .from('collectibles')
    .upload(filePath, req.file.buffer, {
      contentType: req.file.mimetype,
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
      name: name || 'Untitled Item',
      description: description || '',
      image_url: urlData.publicUrl,
      page_number: page_number ? Number(page_number) : 1,
      slot_index: slot_index !== undefined && slot_index !== '' ? Number(slot_index) : null,
      position_data: position_data ? JSON.parse(position_data) : { x: 50, y: 50, scale: 1, z_index: 1 },
    })
    .select()
    .single();

  if (dbErr) return sendAuthError(res, dbErr);
  res.status(201).json({ item });
});

export default router;
