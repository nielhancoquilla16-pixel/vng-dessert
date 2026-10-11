import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';
import { BLOCKED_CUSTOMER_MESSAGE, isBlockedCustomerMailbox } from '../lib/registrationEmail.js';

const getBearerToken = (authorizationHeader = '') => {
  const [scheme, token] = String(authorizationHeader).split(' ');
  return scheme?.toLowerCase() === 'bearer' ? token : '';
};

export const requireAuth = async (req, res, next) => {
  try {
    const token = getBearerToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ error: 'Please sign in to continue.' });
    }

    const supabase = getSupabaseAdmin();
    const { data: authData, error: authError } = await supabase.auth.getUser(token);

    if (authError && (
      authError.name === 'AuthRetryableFetchError'
      || Number(authError.status) >= 500
      || [408, 429].includes(Number(authError.status))
      || /fetch failed|failed to fetch|network|timeout/i.test(authError.message || '')
    )) {
      const unavailableError = new Error('Session verification is temporarily unavailable.', { cause: authError });
      unavailableError.status = Number(authError.status) === 429 ? 429 : 503;
      return next(unavailableError);
    }

    if (authError || !authData?.user) {
      return res.status(401).json({ error: 'Please sign in again to continue.' });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (profileError) {
      return next(profileError);
    }

    // Only the server's validated signup flow may create customer profiles.
    // Calling the auth provider directly must not auto-create an app account.
    if (!profile || !['customer', 'staff', 'admin'].includes(profile.role)) {
      return res.status(403).json({ error: 'Please complete account registration before continuing.' });
    }

    // Confirmation proves access to the inbox, including a public temporary
    // inbox. Existing tokens must not bypass a confirmed mailbox block.
    if (profile.role === 'customer' && (
      isBlockedCustomerMailbox(authData.user.email) || isBlockedCustomerMailbox(profile.email)
    )) {
      return res.status(403).json({ error: BLOCKED_CUSTOMER_MESSAGE });
    }

    req.accessToken = token;
    req.authUser = authData.user;
    req.profile = profile || null;

    const isPasswordChangeRequest = /\/api\/auth\/password\/change$/i.test(req.originalUrl || req.url || '');
    const authEmailVerifiedAt = authData.user.email_confirmed_at || null;

    if (!isPasswordChangeRequest && profile?.locked_until && new Date(profile.locked_until).getTime() > Date.now()) {
      return res.status(423).json({ error: 'Account is temporarily locked. Try again later or reset your password.' });
    }

    if (!isPasswordChangeRequest && profile?.role === 'customer' && !authEmailVerifiedAt) {
      return res.status(403).json({ error: 'Email verification is required before this account can continue.' });
    }

    if (profile?.role === 'customer' && !profile.email_verified && authEmailVerifiedAt) {
      const { error: syncError } = await supabase
        .from('profiles')
        .update({
          email_verified: true,
          email_verified_at: authEmailVerifiedAt,
        })
        .eq('id', profile.id);

      if (syncError) {
        console.warn('Failed to sync confirmed Supabase email status to profile:', syncError.message);
      }

      req.profile = {
        ...profile,
        email_verified: true,
        email_verified_at: authEmailVerifiedAt,
      };
    }

    next();
  } catch (error) {
    next(error);
  }
};

export const optionalAuth = (req, res, next) => (
  req.headers.authorization ? requireAuth(req, res, next) : next()
);
