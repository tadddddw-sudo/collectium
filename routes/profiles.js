import express from 'express';
import { supabase, createAuthClient } from '../supabaseClient.js';

const router = express.Router();

// GET /api/profiles/:username -> Fetch profile + their binders & display cases
router.get('/:username', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const client = token ? createAuthClient(token) : supabase;

  const { data: profile, error: profileErr } = await client
    .from('profiles')
    .select('id, username, display_name, bio, avatar_url, created_at')
    .eq('username', req.params.username)
    .single();

  if (profileErr || !profile) {
    return res.status(404).json({ error: 'Collector profile not found.' });
  }

  const { data: collections, error: colErr } = await client
    .from('collections')
    .select('*, collection_items(id, image_url)')
    .eq('user_id', profile.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (colErr) return res.status(400).json({ error: colErr.message });

  res.json({ profile, collections });
});

export default router;
