import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';

const getBearerToken = (authorizationHeader = '') => {
  const [scheme, token] = authorizationHeader.split(' ');
  return scheme?.toLowerCase() === 'bearer' ? token : '';
};

export const requireAuth = async (req, res, next) => {
  try {
    const token = getBearerToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ error: 'Missing bearer token.' });
    }

    const supabase = getSupabaseAdmin();
    const { data: authData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authData?.user) {
      return res.status(401).json({ error: 'Invalid or expired session token.' });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (profileError) {
      return res.status(500).json({ error: profileError.message });
    }

    req.accessToken = token;
    req.authUser = authData.user;
    req.profile = profile || null;

    const isPasswordChangeRequest = /\/api\/auth\/password\/change$/i.test(req.originalUrl || req.url || '');
    const authEmailVerifiedAt = authData.user.email_confirmed_at || authData.user.confirmed_at || null;

    if (!isPasswordChangeRequest && profile?.locked_until && new Date(profile.locked_until).getTime() > Date.now()) {
      return res.status(423).json({ error: 'Account is temporarily locked. Try again later or reset your password.' });
    }

    if (!isPasswordChangeRequest && profile?.role === 'customer' && !profile.email_verified && !authEmailVerifiedAt) {
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
