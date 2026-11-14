import { createAuthClient } from '../supabaseClient.js';
import { sendAuthError } from '../sessions.js';
import { asyncRouter } from '../asyncRouter.js';
import { writeLimiter } from '../rateLimits.js';
import { pickFields, isPlainObject } from '../validation.js';

const router = asyncRouter();

/**
 * The fields a client may change on an item. collection_id, user_id and
 * image_url are deliberately absent: moving an item into another collection or
 * pointing it at an arbitrary URL is not something the app does.
 */
const ITEM_FIELDS = {
  name: (v) => typeof v === 'string' && v.length <= 120,
  description: (v) => typeof v === 'string' && v.length <= 2000,
  page_number: (v) => Number.isInteger(v) && v > 0,
  slot_index: (v) => v === null || (Number.isInteger(v) && v >= 0),
  position_data: isPlainObject,
};

// PATCH /api/items/:id -> Update item slot, page, or display case X/Y coordinates
router.patch('/:id', writeLimiter, async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { updates, error: fieldError } = pickFields(req.body, ITEM_FIELDS);
  if (fieldError) return res.status(400).json({ error: fieldError });

  const userSupabase = createAuthClient(token);
  const { data, error } = await userSupabase
    .from('collection_items')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return sendAuthError(res, error);
  res.json({ item: data });
});

// DELETE /api/items/:id
router.delete('/:id', writeLimiter, async (req, res) => {
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
