import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';
import { canonicalGmailAddress } from '../../shared/registrationEmail.js';
import { validateCustomerRegistrationEmail } from '../lib/registrationEmail.js';
import { clientIp, createRequestLimiter, rateLimitKey, rejectRateLimitedRequest } from './rateLimit.js';

export const createRegistrationGuard = ({ getSupabase = getSupabaseAdmin, now = Date.now } = {}) => {
  const ipLimiter = createRequestLimiter({ limit: 10, windowMs: 15 * 60000, now });
  const mailboxLimiter = createRequestLimiter({ limit: 3, windowMs: 60 * 60000, now });
  const suspiciousLimiter = createRequestLimiter({ limit: 3, windowMs: 15 * 60000, now });
  const middleware = async (req, res, next) => {
    try {
      const ip = clientIp(req);
      const validation = validateCustomerRegistrationEmail(req.body?.email);
      const emailKey = rateLimitKey(canonicalGmailAddress(req.body?.email));
      const patternKey = rateLimitKey(validation.pattern || validation.reason);
      const checks = [ipLimiter.consume(rateLimitKey(ip)), mailboxLimiter.consume(emailKey)];
      if (validation.reason === 'suspicious_pattern' || validation.score >= 3) checks.push(suspiciousLimiter.consume(rateLimitKey(ip)));
      const blocked = checks.find((check) => !check.allowed);
      if (blocked) return rejectRateLimitedRequest(req, res, blocked.retryAfter, 'registration');

      const supabase = getSupabase();
      // Existing audit storage makes the limits survive restarts and apply
      // across instances. No new table or customer-visible fields are needed.
      const since = new Date(now() - 60 * 60000).toISOString();
      const [ipHistory, emailHistory] = await Promise.all([
        supabase.from('audit_logs').select('metadata, created_at').eq('action', 'customer_registration_attempt').eq('ip_address', ip).gte('created_at', since).limit(100),
        supabase.from('audit_logs').select('metadata, created_at').eq('action', 'customer_registration_attempt').eq('metadata->>emailKey', emailKey).gte('created_at', since).limit(10),
      ]);
      if (ipHistory.error || emailHistory.error) throw ipHistory.error || emailHistory.error;
      const recent = (ipHistory.data || []).filter((entry) => Date.parse(entry.created_at) > now() - 15 * 60000);
      const suspicious = recent.filter((entry) => entry.metadata?.suspicious);
      const samePattern = (ipHistory.data || []).filter((entry) => entry.metadata?.patternKey === patternKey && entry.metadata?.score >= 3);
      if (recent.length >= 10 || (emailHistory.data || []).length >= 3 || (validation.score >= 3 && (suspicious.length >= 3 || samePattern.length >= 3))) {
        return rejectRateLimitedRequest(req, res, 900, 'registration_abuse');
      }
      const { error } = await supabase.from('audit_logs').insert({
        created_at: new Date(now()).toISOString(),
        action: 'customer_registration_attempt', actor_role: 'anonymous', target_type: 'registration_attempt',
        ip_address: ip.slice(0, 120), user_agent: String(req.headers['user-agent'] || '').slice(0, 500),
        metadata: { emailKey, patternKey, score: validation.score, suspicious: ['suspicious_pattern', 'disposable_mailbox'].includes(validation.reason), reason: validation.reason },
      });
      if (error) throw error;
      next();
    } catch (error) {
      console.error('Registration abuse check failed:', error);
      res.locals.errorLogged = true;
      res.status(503).json({ error: 'Account registration is temporarily unavailable. Please try again shortly.' });
    }
  };
  return { middleware, clear: () => { ipLimiter.clear(); mailboxLimiter.clear(); suspiciousLimiter.clear(); } };
};
export const registrationGuard = createRegistrationGuard();
