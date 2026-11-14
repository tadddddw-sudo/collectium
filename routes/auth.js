import express from 'express';
import { supabase, createAuthClient } from '../supabaseClient.js';

const router = express.Router();

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

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError) return res.status(401).json({ error: authError.message });

  const userSupabase = createAuthClient(authData.session.access_token);
  const { data: profile, error: profileError } = await userSupabase
    .from('profiles')
    .select('id, username, display_name, bio, avatar_url, created_at')
    .eq('id', authData.user.id)
    .single();

  if (profileError) return res.status(400).json({ error: profileError.message });

  res.json({
    user: authData.user,
    session: authData.session,
    profile,
  });
});

export default router;
