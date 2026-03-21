import express from 'express';
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';

const router = express.Router();

const normalizeValue = (value = '') => value.trim().toLowerCase();

const mapProfile = (row) => ({
  id: row.id,
  username: row.username,
  email: row.email,
  fullName: row.full_name,
  role: row.role,
  address: row.address,
  phoneNumber: row.phone_number,
  createdAt: row.created_at,
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();

    if (!req.profile) {
      const { data, error } = await supabase
        .from('profiles')
        .insert({
          id: req.authUser.id,
          username: req.authUser.user_metadata?.username || null,
          email: req.authUser.email || null,
          full_name: req.authUser.user_metadata?.full_name || null,
          role: 'customer',
          address: null,
          phone_number: null,
        })
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      return res.json(mapProfile(data));
    }

    res.json(mapProfile(req.profile));
  } catch (error) {
    next(error);
  }
});

router.put('/me', requireAuth, async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const updates = {
      id: req.authUser.id,
      username: req.body.username
        ? normalizeValue(req.body.username)
        : (req.profile?.username ?? req.authUser.user_metadata?.username ?? null),
      email: req.profile?.email ?? req.authUser.email ?? null,
      full_name: req.body.full_name ?? req.profile?.full_name ?? null,
      role: req.profile?.role || 'customer',
      address: req.body.address ?? req.profile?.address ?? null,
      phone_number: req.body.phone_number ?? req.profile?.phone_number ?? null,
    };

    const { data, error } = await supabase
      .from('profiles')
      .upsert(updates, { onConflict: 'id' })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    res.json(mapProfile(data));
  } catch (error) {
    next(error);
  }
});

router.get('/staff', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .in('role', ['admin', 'staff'])
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    res.json((data || []).map(mapProfile));
  } catch (error) {
    next(error);
  }
});

router.post('/staff', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const {
      email,
      password,
      username,
      full_name,
      role = 'staff',
      address = null,
      phone_number = null,
    } = req.body;

    if (!email || !password || !username) {
      return res.status(400).json({ error: 'email, password, and username are required.' });
    }

    if (!['staff', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'role must be staff or admin.' });
    }

    const normalizedEmail = normalizeValue(email);
    const normalizedUsername = normalizeValue(username);

    const supabase = getSupabaseAdmin();
    const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        username: normalizedUsername,
        full_name: full_name || '',
      },
    });

    if (createError) {
      throw createError;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: createdUser.user.id,
        username: normalizedUsername,
        email: normalizedEmail,
        full_name: full_name || '',
        role,
        address,
        phone_number,
      })
      .select('*')
      .single();

    if (profileError) {
      throw profileError;
    }

    res.status(201).json(mapProfile(profile));
  } catch (error) {
    next(error);
  }
});

router.delete('/staff/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.auth.admin.deleteUser(req.params.id);

    if (error) {
      throw error;
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
