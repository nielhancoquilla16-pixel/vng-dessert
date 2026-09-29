import express from 'express';
import { randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { getSupabaseAdmin, getSupabaseAnon } from '../lib/supabaseAdmin.js';
import { validatePasswordPolicy } from '../lib/passwordPolicy.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { writeAuditLog } from '../lib/auditLog.js';
import { normalizeAuthEmailError } from '../lib/authEmailErrors.js';

const router = express.Router();
const EMAIL_LINK_RESEND_COOLDOWN_MS = 35 * 1000;
const CAPTCHA_EXPIRY_MS = 10 * 60 * 1000;
const MFA_EXPIRY_MS = 5 * 60 * 1000;
const LOGIN_LOCKOUT_THRESHOLD = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const captchaChallenges = new Map();

const normalizeIdentifier = (value = '') => String(value || '').trim().toLowerCase();
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
const isValidEmail = (value = '') => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
const validateGmailRegistration = (value = '') => {
  const email = normalizeIdentifier(value);
  if (!isValidEmail(email)) {
    return { valid: false, status: 'Invalid email format', reason: 'The email address is not correctly formatted.' };
  }
  if (!['gmail.com', 'googlemail.com'].includes(email.split('@').at(-1))) {
    return { valid: false, status: 'Invalid Gmail address', reason: 'Customer registration requires a Gmail address.' };
  }
  return { valid: true };
};
const isGmailAddress = (value = '') => (
  ['gmail.com', 'googlemail.com'].includes(normalizeIdentifier(value).split('@').at(-1))
);
const writeGmailRegistrationAudit = async (supabase, req, {
  customerName = '',
  email = '',
  status,
  reason,
} = {}) => {
  await writeAuditLog(supabase, req, {
    action: 'invalid_gmail_registration',
    actorRole: 'anonymous',
    targetType: 'registration_attempt',
    metadata: {
      customerName: String(customerName || '').trim().slice(0, 200) || 'Customer',
      email: String(email || '').trim().slice(0, 320),
      status,
      reason,
      registrationAttemptAt: new Date().toISOString(),
    },
  });
};
const isValidUsername = (value = '') => /^[a-z0-9_.-]{3,30}$/.test(String(value || '').trim());
const normalizeAcceptedTermsAt = (value) => {
  const parsedValue = value ? new Date(value) : new Date();
  return Number.isNaN(parsedValue.getTime())
    ? new Date().toISOString()
    : parsedValue.toISOString();
};

const secondsUntil = (dateValue) => {
  const msRemaining = new Date(dateValue).getTime() - Date.now();
  return Math.max(0, Math.ceil(msRemaining / 1000));
};

const getFrontendRedirectTo = (path = 'login') => {
  const baseUrl = String(process.env.FRONTEND_APP_URL || '').trim().replace(/\/$/, '');
  return baseUrl ? `${baseUrl}/${String(path || '').replace(/^\/+/, '')}` : undefined;
};

const isAccountLocked = (profile = {}) => (
  profile?.locked_until && new Date(profile.locked_until).getTime() > Date.now()
);

const cleanupCaptchaChallenges = () => {
  const now = Date.now();
  captchaChallenges.forEach((challenge, challengeId) => {
    if (challenge.expiresAt <= now) {
      captchaChallenges.delete(challengeId);
    }
  });
};

const createCaptchaChallenge = () => {
  cleanupCaptchaChallenges();
  const left = randomInt(2, 10);
  const right = randomInt(2, 10);
  const id = randomUUID();

  captchaChallenges.set(id, {
    answer: String(left + right),
    expiresAt: Date.now() + CAPTCHA_EXPIRY_MS,
  });

  return {
    id,
    question: `${left} + ${right}`,
    expiresInSeconds: Math.floor(CAPTCHA_EXPIRY_MS / 1000),
  };
};

const validateCaptchaChallenge = (captchaId = '', captchaAnswer = '') => {
  cleanupCaptchaChallenges();
  const challenge = captchaChallenges.get(String(captchaId || ''));

  if (!challenge) {
    return { valid: false, error: 'CAPTCHA expired. Please refresh the challenge and try again.' };
  }

  captchaChallenges.delete(String(captchaId || ''));

  if (String(captchaAnswer || '').trim() !== challenge.answer) {
    return { valid: false, error: 'CAPTCHA answer is incorrect.' };
  }

  return { valid: true };
};

const requireCaptcha = (req) => {
  const captchaId = req.body?.captcha_id || req.body?.captchaId;
  const captchaAnswer = req.body?.captcha_answer || req.body?.captchaAnswer;
  return validateCaptchaChallenge(captchaId, captchaAnswer);
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
    .select('id, username, email, role, email_verified, locked_until, failed_login_attempts')
    .ilike(profileColumn, identifier)
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  if (profile?.email) {
    const {
      data: { user: authUser },
      error: authUserError,
    } = await supabase.auth.admin.getUserById(profile.id);

    if (authUserError) {
      throw authUserError;
    }

    return {
      id: profile.id,
      username: normalizeIdentifier(profile.username),
      email: normalizeIdentifier(profile.email),
      role: normalizeRole(profile.role),
      emailVerified: Boolean(profile.email_verified || authUser?.email_confirmed_at || authUser?.confirmed_at),
      lockedUntil: profile.locked_until || null,
      failedLoginAttempts: Number(profile.failed_login_attempts) || 0,
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
    .select('username, role, email_verified, locked_until, failed_login_attempts')
    .eq('id', authUser.id)
    .maybeSingle();

  if (profileByIdError) {
    throw profileByIdError;
  }

  return {
    id: authUser.id,
    username: normalizeIdentifier(profileById?.username || authUser.user_metadata?.username),
    email: normalizeIdentifier(authUser.email),
    role: normalizeRole(profileById?.role || authUser.user_metadata?.role),
    emailVerified: Boolean(profileById?.email_verified || authUser.email_confirmed_at),
    lockedUntil: profileById?.locked_until || null,
    failedLoginAttempts: Number(profileById?.failed_login_attempts) || 0,
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

router.get('/captcha', (req, res) => {
  res.json(createCaptchaChallenge());
});

router.post('/resolve-login', async (req, res, next) => {
  try {
    const identifier = normalizeIdentifier(req.body?.identifier);
    const allowedRoles = normalizeRoleList(req.body?.allowed_roles);
    const shouldRequireCaptcha = req.body?.captcha_required !== false;
    const allowLocked = req.body?.allow_locked === true;

    if (!identifier) {
      return res.status(400).json({ error: 'identifier is required.' });
    }

    if (shouldRequireCaptcha) {
      const captchaValidation = requireCaptcha(req);
      if (!captchaValidation.valid) {
        return res.status(400).json({ error: captchaValidation.error });
      }
    }

    const supabase = getSupabaseAdmin();
    const resolvedAccount = await resolveAccountForLogin(supabase, identifier);

    if (!resolvedAccount?.email) {
      return res.status(404).json({ error: 'Account not found.' });
    }

    if (!allowLocked && isAccountLocked({ locked_until: resolvedAccount.lockedUntil })) {
      return res.status(423).json({
        error: 'Account is temporarily locked after multiple failed attempts. Try again later or reset your password.',
        lockedUntil: resolvedAccount.lockedUntil,
      });
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(resolvedAccount.role)) {
      return res.status(403).json({ error: 'This account does not have permission for that action.' });
    }

    res.json({
      id: resolvedAccount.id,
      email: resolvedAccount.email,
      username: resolvedAccount.username,
      role: resolvedAccount.role || 'customer',
      emailVerified: resolvedAccount.role === 'customer' ? resolvedAccount.emailVerified : true,
      lockedUntil: resolvedAccount.lockedUntil,
    });
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

    const passwordValidation = validatePasswordPolicy(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ error: passwordValidation.message });
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

router.get('/admin/invalid-gmail-registrations', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('audit_logs')
      .select('id, metadata, created_at')
      .eq('action', 'invalid_gmail_registration')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;
    res.json((data || []).map((entry) => ({
      id: entry.id,
      customerName: entry.metadata?.customerName || 'Customer',
      email: entry.metadata?.email || '',
      status: entry.metadata?.status || 'Invalid Gmail address',
      reason: entry.metadata?.reason || '',
      createdAt: entry.metadata?.registrationAttemptAt || entry.created_at,
    })));
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
    const captchaValidation = requireCaptcha(req);

    if (!email || !password || !username) {
      return res.status(400).json({ error: 'email, password, and username are required.' });
    }

    if (!captchaValidation.valid) {
      return res.status(400).json({ error: captchaValidation.error });
    }

    const passwordValidation = validatePasswordPolicy(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ error: passwordValidation.message });
    }

    if (!terms_accepted) {
      return res.status(400).json({ error: 'You must agree to the Terms and Conditions before creating an account.' });
    }

    const normalizedEmail = normalizeIdentifier(email);
    const normalizedUsername = normalizeIdentifier(username);
    const normalizedTermsVersion = normalizeOptionalText(terms_version);
    const normalizedTermsAcceptedAt = normalizeAcceptedTermsAt(terms_accepted_at);

    const gmailValidation = validateGmailRegistration(normalizedEmail);
    if (!gmailValidation.valid) {
      await writeGmailRegistrationAudit(getSupabaseAdmin(), req, {
        customerName: full_name,
        email: normalizedEmail,
        status: gmailValidation.status,
        reason: gmailValidation.reason,
      });
      return res.status(400).json({
        error: 'Enter a correctly formatted Gmail address ending in @gmail.com.',
        errorCode: 'INVALID_GMAIL_REGISTRATION',
      });
    }

    if (!isValidUsername(normalizedUsername)) {
      return res.status(400).json({ error: 'Username must be 3-30 characters and use letters, numbers, dots, dashes, or underscores only.' });
    }

    const supabase = getSupabaseAdmin();
    const conflicts = await getRegistrationConflicts(supabase, normalizedEmail, normalizedUsername);

    if (conflicts.username || conflicts.email) {
      return res.status(409).json({
        error: buildRegistrationConflictMessage(conflicts),
        conflicts,
      });
    }

    const userMetadata = {
      username: normalizedUsername,
      full_name,
      role: 'customer',
      terms_accepted: true,
      terms_accepted_at: normalizedTermsAcceptedAt,
      terms_version: normalizedTermsVersion,
      email_verified: false,
    };
    const anon = getSupabaseAnon();
    const { data: signupData, error: signupError } = await anon.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: getFrontendRedirectTo('login'),
        data: userMetadata,
      },
    });

    if (signupError) {
      const normalizedSignupError = normalizeAuthEmailError(signupError);
      if (isGmailAddress(normalizedEmail) && ['email_address_invalid', 'email_invalid'].includes(String(signupError.code || ''))) {
        await writeGmailRegistrationAudit(supabase, req, {
          customerName: full_name,
          email: normalizedEmail,
          status: 'Invalid Gmail address',
          reason: 'The email verification provider rejected this Gmail address as invalid.',
        });
      } else if (normalizedSignupError?.errorCode === 'AUTH_EMAIL_DELIVERY_UNAVAILABLE') {
        await writeGmailRegistrationAudit(supabase, req, {
          customerName: full_name,
          email: normalizedEmail,
          status: 'Unverified/unconfirmed Gmail address',
          reason: 'The verification email could not be delivered or confirmed. This does not prove the Gmail address is fake.',
        });
      }
      throw normalizedSignupError;
    }

    if (!signupData?.user?.id) {
      return res.status(502).json({ error: 'Unable to start email verification right now.' });
    }

    const sentAt = new Date();
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: signupData.user.id,
        username: normalizedUsername,
        email: normalizedEmail,
        full_name: full_name || '',
        role: 'customer',
        address: address || null,
        phone_number: phone_number || null,
        terms_accepted: true,
        terms_accepted_at: normalizedTermsAcceptedAt,
        terms_version: normalizedTermsVersion,
        email_verified: false,
        email_verified_at: null,
        email_verification_sent_at: sentAt.toISOString(),
      })
      .select('*')
      .single();

    if (profileError) {
      await supabase.auth.admin.deleteUser(signupData.user.id).catch(() => {});
      throw profileError;
    }

    await writeAuditLog(supabase, req, {
      action: 'customer_signup_started',
      actorId: profile.id,
      actorRole: 'customer',
      targetId: profile.id,
      targetType: 'profile',
      metadata: { email: normalizedEmail, verificationMethod: 'email_link' },
    });

    res.status(201).json({
      id: profile.id,
      username: profile.username,
      email: profile.email,
      fullName: profile.full_name,
      role: profile.role,
      address: profile.address,
      phoneNumber: profile.phone_number,
      createdAt: profile.created_at,
      needsVerification: true,
      emailVerified: false,
      resendCooldownSeconds: Math.floor(EMAIL_LINK_RESEND_COOLDOWN_MS / 1000),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/register/resend-link', async (req, res, next) => {
  try {
    const email = normalizeIdentifier(req.body?.email);

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    const supabase = getSupabaseAdmin();
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, email_verified, email_verification_sent_at')
      .ilike('email', email)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (!profile || profile.role !== 'customer') {
      return res.status(404).json({ error: 'Customer account not found.' });
    }

    if (profile.email_verified) {
      return res.status(409).json({ error: 'This account is already verified.' });
    }

    if (
      profile.email_verification_sent_at
      && Date.now() - new Date(profile.email_verification_sent_at).getTime() < EMAIL_LINK_RESEND_COOLDOWN_MS
    ) {
      const cooldownEndsAt = new Date(new Date(profile.email_verification_sent_at).getTime() + EMAIL_LINK_RESEND_COOLDOWN_MS);
      return res.status(429).json({
        error: 'Please wait before requesting another verification link.',
        cooldownSeconds: secondsUntil(cooldownEndsAt),
      });
    }

    const anon = getSupabaseAnon();
    const { error: resendError } = await anon.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: getFrontendRedirectTo('login'),
      },
    });

    if (resendError) {
      const normalizedResendError = normalizeAuthEmailError(resendError);
      if (isGmailAddress(email) && normalizedResendError?.errorCode === 'AUTH_EMAIL_DELIVERY_UNAVAILABLE') {
        await writeGmailRegistrationAudit(supabase, req, {
          customerName: profile.full_name,
          email,
          status: 'Unverified/unconfirmed Gmail address',
          reason: 'The verification email could not be delivered or confirmed. This does not prove the Gmail address is fake.',
        });
      }
      if (isGmailAddress(email) && ['email_address_invalid', 'email_invalid'].includes(String(resendError.code || ''))) {
        await writeGmailRegistrationAudit(supabase, req, {
          customerName: profile.full_name,
          email,
          status: 'Invalid Gmail address',
          reason: 'The email verification provider rejected this Gmail address as invalid.',
        });
      }
      throw normalizedResendError;
    }

    const sentAt = new Date();
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        email_verification_sent_at: sentAt.toISOString(),
      })
      .eq('id', profile.id);

    if (updateError) {
      throw updateError;
    }

    await writeAuditLog(supabase, req, {
      action: 'customer_signup_link_resent',
      actorId: profile.id,
      actorRole: 'customer',
      targetId: profile.id,
      targetType: 'profile',
      metadata: { email },
    });

    res.json({
      success: true,
      email,
      resendCooldownSeconds: Math.floor(EMAIL_LINK_RESEND_COOLDOWN_MS / 1000),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/login/failed', async (req, res, next) => {
  try {
    const identifier = normalizeIdentifier(req.body?.identifier);

    if (!identifier) {
      return res.json({ success: true });
    }

    const supabase = getSupabaseAdmin();
    const account = await resolveAccountForLogin(supabase, identifier);

    if (!account?.id) {
      return res.json({ success: true });
    }

    const nextAttempts = Number(account.failedLoginAttempts || 0) + 1;
    const lockedUntil = nextAttempts >= LOGIN_LOCKOUT_THRESHOLD
      ? new Date(Date.now() + LOGIN_LOCKOUT_MS).toISOString()
      : null;

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        failed_login_attempts: nextAttempts,
        ...(lockedUntil ? { locked_until: lockedUntil } : {}),
      })
      .eq('id', account.id);

    if (updateError) {
      throw updateError;
    }

    await writeAuditLog(supabase, req, {
      action: lockedUntil ? 'login_locked' : 'login_failed',
      actorId: account.id,
      actorRole: account.role,
      targetId: account.id,
      targetType: 'profile',
      metadata: {
        identifier,
        attempts: nextAttempts,
        lockedUntil,
      },
    });

    res.json({
      success: true,
      attempts: nextAttempts,
      lockedUntil,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/login/success', requireAuth, async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        failed_login_attempts: 0,
        locked_until: null,
        last_login_at: now,
      })
      .eq('id', req.authUser.id);

    if (updateError) {
      throw updateError;
    }

    await writeAuditLog(supabase, req, {
      action: 'login_success',
      actorId: req.authUser.id,
      actorRole: req.profile?.role,
      targetId: req.authUser.id,
      targetType: 'profile',
      metadata: {
        email: req.profile?.email || req.authUser.email || '',
      },
    });

    res.json({ success: true, lastLoginAt: now });
  } catch (error) {
    next(error);
  }
});

router.post('/mfa/start', requireAuth, async (req, res, next) => {
  try {
    const role = normalizeRole(req.profile?.role);

    if (!['admin', 'staff'].includes(role)) {
      return res.status(403).json({ error: 'MFA is only available for admin and staff accounts.' });
    }

    const email = normalizeIdentifier(req.profile?.email || req.authUser?.email);

    if (!email) {
      return res.status(400).json({ error: 'This account does not have an email address for MFA.' });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: {
        redirectTo: getFrontendRedirectTo('login'),
      },
    });

    if (error) {
      throw error;
    }

    const code = data?.properties?.email_otp;

    if (!/^\d{6}$/.test(String(code || ''))) {
      return res.status(502).json({ error: 'Unable to create a 6-digit security code right now.' });
    }

    await writeAuditLog(supabase, req, {
      action: 'mfa_code_generated',
      actorId: req.authUser.id,
      actorRole: role,
      targetId: req.authUser.id,
      targetType: 'profile',
      metadata: { email },
    });

    res.json({
      success: true,
      email,
      role,
      code,
      expiresInSeconds: Math.floor(MFA_EXPIRY_MS / 1000),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/password/change', requireAuth, async (req, res, next) => {
  try {
    const password = String(req.body?.password ?? '');

    if (!password) {
      return res.status(400).json({ error: 'password is required.' });
    }

    const passwordValidation = validatePasswordPolicy(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ error: passwordValidation.message });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.auth.admin.updateUserById(req.authUser.id, {
      password,
    });

    if (error) {
      throw error;
    }

    await writeAuditLog(supabase, req, {
      action: 'password_changed',
      actorId: req.authUser.id,
      actorRole: req.profile?.role,
      targetId: req.authUser.id,
      targetType: 'profile',
    });

    await supabase
      .from('profiles')
      .update({
        failed_login_attempts: 0,
        locked_until: null,
      })
      .eq('id', req.authUser.id);

    res.json({ success: true });
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
