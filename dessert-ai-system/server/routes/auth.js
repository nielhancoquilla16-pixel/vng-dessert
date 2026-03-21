import express from 'express';
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';

const router = express.Router();

const normalizeIdentifier = (value = '') => value.trim().toLowerCase();

router.post('/resolve-login', async (req, res, next) => {
  try {
    const identifier = normalizeIdentifier(req.body?.identifier);

    if (!identifier) {
      return res.status(400).json({ error: 'identifier is required.' });
    }

    if (identifier.includes('@')) {
      return res.json({ email: identifier });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('profiles')
      .select('email')
      .ilike('username', identifier)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data?.email) {
      return res.status(404).json({ error: 'Account not found.' });
    }

    res.json({ email: data.email });
  } catch (error) {
    next(error);
  }
});

router.post('/register', async (req, res, next) => {
  try {
    const {
      email,
      password,
      username,
      full_name = '',
      address = '',
      phone_number = '',
    } = req.body || {};

    if (!email || !password || !username) {
      return res.status(400).json({ error: 'email, password, and username are required.' });
    }

    const normalizedEmail = normalizeIdentifier(email);
    const normalizedUsername = normalizeIdentifier(username);
    const supabase = getSupabaseAdmin();

    const { data: existingByUsername, error: existingUsernameError } = await supabase
      .from('profiles')
      .select('id')
      .ilike('username', normalizedUsername)
      .maybeSingle();

    if (existingUsernameError) {
      throw existingUsernameError;
    }

    const { data: existingByEmail, error: existingEmailError } = await supabase
      .from('profiles')
      .select('id')
      .ilike('email', normalizedEmail)
      .maybeSingle();

    if (existingEmailError) {
      throw existingEmailError;
    }

    if (existingByUsername || existingByEmail) {
      return res.status(409).json({ error: 'That username or email is already in use.' });
    }

    const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        username: normalizedUsername,
        full_name,
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
        role: 'customer',
        address: address || null,
        phone_number: phone_number || null,
      })
      .select('*')
      .single();

    if (profileError) {
      throw profileError;
    }

    res.status(201).json({
      id: profile.id,
      username: profile.username,
      email: profile.email,
      fullName: profile.full_name,
      role: profile.role,
      address: profile.address,
      phoneNumber: profile.phone_number,
      createdAt: profile.created_at,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/test-supabase', async (req, res, next) => {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;

    // The user's requested fetch logic
    const response = await fetch(url + '/rest/v1/profiles?select=count', {
      method: "GET",
      headers: {
        "apikey": key,
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
      }
    });

    const data = await response.json();
    res.json({
      status: response.status,
      statusText: response.statusText,
      data
    });
  } catch (error) {
    next(error);
  }
});

export default router;
