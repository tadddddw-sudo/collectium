import express from 'express';
import { createAuthClient } from '../supabaseClient.js';
import { sendAuthError } from '../sessions.js';

const router = express.Router();

// PATCH /api/items/:id -> Update item slot, page, or display case X/Y coordinates
router.patch('/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const userSupabase = createAuthClient(token);
  const updates = { ...req.body, updated_at: new Date().toISOString() };

  const { data, error } = await userSupabase
    .from('collection_items')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return sendAuthError(res, error);
  res.json({ item: data });
});

// DELETE /api/items/:id
router.delete('/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const userSupabase = createAuthClient(token);
  const { error } = await userSupabase
    .from('collection_items')
    .delete()
    .eq('id', req.params.id);

  if (error) return sendAuthError(res, error);
  res.json({ success: true });
});

export default router;
