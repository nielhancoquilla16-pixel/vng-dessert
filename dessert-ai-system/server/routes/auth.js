import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';

const router = express.Router();

const normalizeIdentifier = (value = '') => value.trim().toLowerCase();
const normalizeRole = (value = '') => String(value || '').trim().toLowerCase();
const normalizeRoleList = (value) => (
  Array.isArray(value)
    ? value.map((role) => normalizeRole(role)).filter(Boolean)
    : []
);
const normalizeAdminResetCode = (value = '') => String(value || '').replace(/\D/g, '').slice(0, 6);
const normalizeOptionalText = (value = '') => {
  const trimmed = String(value || '').trim();
  return trimmed || null;
};
const normalizeAcceptedTermsAt = (value) => {
  const parsedValue = value ? new Date(value) : new Date();
  return Number.isNaN(parsedValue.getTime())
    ? new Date().toISOString()
    : parsedValue.toISOString();
};

const listAuthUsers = async (supabase) => {
  const users = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) {
      throw error;
    }

    const batch = data?.users || [];
    users.push(...batch);
    hasMore = batch.length === 200;
    page += 1;
  }

  return users;
};

const findAuthUserByUsername = (users, username) => (
  users.find((user) => normalizeIdentifier(user.user_metadata?.username) === username)
);

const findAuthUserByEmail = (users, email) => (
  users.find((user) => normalizeIdentifier(user.email) === email)
);

const getConfiguredAdminResetCode = () => normalizeAdminResetCode(process.env.ADMIN_RESET_CODE);

const hasConfiguredAdminResetCode = () => /^\d{6}$/.test(getConfiguredAdminResetCode());

const matchesAdminResetCode = (candidateCode = '') => {
  const normalizedCandidateCode = normalizeAdminResetCode(candidateCode);
  const configuredCode = getConfiguredAdminResetCode();

  if (!/^\d{6}$/.test(normalizedCandidateCode) || !/^\d{6}$/.test(configuredCode)) {
    return false;
  }

  const candidateBuffer = Buffer.from(normalizedCandidateCode, 'utf8');
  const configuredBuffer = Buffer.from(configuredCode, 'utf8');

  return candidateBuffer.length === configuredBuffer.length
    && timingSafeEqual(candidateBuffer, configuredBuffer);
};

const resolveAccountForLogin = async (supabase, identifier) => {
  const profileColumn = identifier.includes('@') ? 'email' : 'username';
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, role')
    .ilike(profileColumn, identifier)
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  if (profile?.email) {
    return {
      id: profile.id,
      email: normalizeIdentifier(profile.email),
      role: normalizeRole(profile.role),
    };
  }

  const authUsers = await listAuthUsers(supabase);
  const authUser = identifier.includes('@')
    ? findAuthUserByEmail(authUsers, identifier)
    : findAuthUserByUsername(authUsers, identifier);

  if (!authUser?.email) {
    return null;
  }

  const { data: profileById, error: profileByIdError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authUser.id)
    .maybeSingle();

  if (profileByIdError) {
    throw profileByIdError;
  }

  return {
    id: authUser.id,
    email: normalizeIdentifier(authUser.email),
    role: normalizeRole(profileById?.role || authUser.user_metadata?.role),
  };
};

const getRegistrationConflicts = async (supabase, normalizedEmail, normalizedUsername) => {
  const [
    { data: existingByUsername, error: existingUsernameError },
    { data: existingByEmail, error: existingEmailError },
    authUsers,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id')
      .ilike('username', normalizedUsername)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('id')
      .ilike('email', normalizedEmail)
      .maybeSingle(),
    listAuthUsers(supabase),
  ]);

  if (existingUsernameError) {
    throw existingUsernameError;
  }

  if (existingEmailError) {
    throw existingEmailError;
  }

  return {
    username: Boolean(existingByUsername || findAuthUserByUsername(authUsers, normalizedUsername)),
    email: Boolean(existingByEmail || findAuthUserByEmail(authUsers, normalizedEmail)),
  };
};

const buildRegistrationConflictMessage = (conflicts) => {
  if (conflicts.username && conflicts.email) {
    return 'That username or email is already in use.';
  }

  if (conflicts.username) {
    return 'That username is already in use.';
  }

  if (conflicts.email) {
    return 'That email is already in use.';
  }

  return 'That username or email is already in use.';
};

const validateAdminResetAttempt = async (supabase, identifier, code) => {
  if (!identifier || !code) {
    return { status: 400, error: 'identifier and code are required.' };
  }

  if (!/^\d{6}$/.test(code)) {
    return { status: 400, error: 'Enter the 6-digit admin reset code.' };
  }

  if (!hasConfiguredAdminResetCode()) {
    return {
      status: 503,
      error: 'Admin reset code is not configured. Add ADMIN_RESET_CODE to dessert-ai-system/server/.env and restart the backend.',
    };
  }

  const resolvedAccount = await resolveAccountForLogin(supabase, identifier);

  if (!resolvedAccount?.id || !resolvedAccount?.email) {
    return { status: 404, error: 'Admin account not found.' };
  }

  if (resolvedAccount.role !== 'admin') {
    return { status: 403, error: 'Only admin accounts can use this reset form.' };
  }

  if (!matchesAdminResetCode(code)) {
    return { status: 403, error: 'The admin reset code is invalid.' };
  }

  return { account: resolvedAccount };
};

router.post('/resolve-login', async (req, res, next) => {
  try {
    const identifier = normalizeIdentifier(req.body?.identifier);
    const allowedRoles = normalizeRoleList(req.body?.allowed_roles);

    if (!identifier) {
      return res.status(400).json({ error: 'identifier is required.' });
    }

    const supabase = getSupabaseAdmin();
    const resolvedAccount = await resolveAccountForLogin(supabase, identifier);

    if (!resolvedAccount?.email) {
      return res.status(404).json({ error: 'Account not found.' });
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(resolvedAccount.role)) {
      return res.status(403).json({ error: 'This account does not have permission for that action.' });
    }

    res.json({ email: resolvedAccount.email });
  } catch (error) {
    next(error);
  }
});

router.post('/register/check', async (req, res, next) => {
  try {
    const email = normalizeIdentifier(req.body?.email);
    const username = normalizeIdentifier(req.body?.username);

    if (!email || !username) {
      return res.status(400).json({ error: 'email and username are required.' });
    }

    const supabase = getSupabaseAdmin();
    const conflicts = await getRegistrationConflicts(supabase, email, username);

    if (conflicts.username || conflicts.email) {
      return res.status(409).json({
        error: buildRegistrationConflictMessage(conflicts),
        conflicts,
      });
    }

    res.json({ available: true });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/verify-reset-code', async (req, res, next) => {
  try {
    const identifier = normalizeIdentifier(req.body?.identifier);
    const code = normalizeAdminResetCode(req.body?.code);
    const supabase = getSupabaseAdmin();
    const validation = await validateAdminResetAttempt(supabase, identifier, code);

    if (validation.error) {
      return res.status(validation.status).json({ error: validation.error });
    }

    res.json({
      success: true,
      email: validation.account.email,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/reset-password', async (req, res, next) => {
  try {
    const identifier = normalizeIdentifier(req.body?.identifier);
    const code = normalizeAdminResetCode(req.body?.code);
    const password = String(req.body?.password ?? '');

    if (!identifier || !code || !password) {
      return res.status(400).json({ error: 'identifier, code, and password are required.' });
    }

    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Enter the 6-digit admin reset code.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const supabase = getSupabaseAdmin();
    const validation = await validateAdminResetAttempt(supabase, identifier, code);

    if (validation.error) {
      return res.status(validation.status).json({ error: validation.error });
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(validation.account.id, {
      password,
    });

    if (updateError) {
      throw updateError;
    }

    res.json({
      success: true,
      email: validation.account.email,
    });
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
      terms_accepted = false,
      terms_accepted_at = null,
      terms_version = '',
    } = req.body || {};

    if (!email || !password || !username) {
      return res.status(400).json({ error: 'email, password, and username are required.' });
    }

    if (!terms_accepted) {
      return res.status(400).json({ error: 'You must agree to the Terms and Conditions before creating an account.' });
    }

    const normalizedEmail = normalizeIdentifier(email);
    const normalizedUsername = normalizeIdentifier(username);
    const normalizedTermsVersion = normalizeOptionalText(terms_version);
    const normalizedTermsAcceptedAt = normalizeAcceptedTermsAt(terms_accepted_at);
    const supabase = getSupabaseAdmin();
    const conflicts = await getRegistrationConflicts(supabase, normalizedEmail, normalizedUsername);

    if (conflicts.username || conflicts.email) {
      return res.status(409).json({
        error: buildRegistrationConflictMessage(conflicts),
        conflicts,
      });
    }

    const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        username: normalizedUsername,
        full_name,
        terms_accepted: true,
        terms_accepted_at: normalizedTermsAcceptedAt,
        terms_version: normalizedTermsVersion,
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
        terms_accepted: true,
        terms_accepted_at: normalizedTermsAcceptedAt,
        terms_version: normalizedTermsVersion,
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
