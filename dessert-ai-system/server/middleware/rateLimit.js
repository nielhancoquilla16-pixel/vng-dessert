import { createHash } from 'node:crypto';

export const clientIp = (req) => String(req.ip || req.socket?.remoteAddress || 'unknown');
export const rateLimitKey = (value) => createHash('sha256').update(String(value)).digest('hex');

// Fixed windows and bounded storage avoid retaining request bodies, credentials,
// or an ever-growing collection of attacker-controlled identifiers in memory.
export const createRequestLimiter = ({ limit, windowMs, maxEntries = 10000, now = Date.now } = {}) => {
  const buckets = new Map();
  const consume = (key) => {
    const time = now();
    for (const [id, bucket] of buckets) if (bucket.expiresAt <= time) buckets.delete(id);
    let bucket = buckets.get(key);
    if (!bucket) {
      if (buckets.size >= maxEntries) return { allowed: false, retryAfter: Math.ceil(windowMs / 1000) };
      bucket = { count: 0, expiresAt: time + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    return { allowed: bucket.count <= limit, retryAfter: Math.max(1, Math.ceil((bucket.expiresAt - time) / 1000)) };
  };
  return { consume, clear: () => buckets.clear() };
};

export const rejectRateLimitedRequest = (req, res, retryAfter, category) => {
  console.warn('Request rate limit reached:', { category, method: req.method, path: req.path });
  res.set('Retry-After', String(retryAfter));
  return res.status(429).json({ error: 'Too many attempts. Please wait a moment and try again.', cooldownSeconds: retryAfter });
};

export const createRateLimitMiddleware = ({ limiter, category = 'api' }) => (req, res, next) => {
  const result = limiter.consume(rateLimitKey(clientIp(req)));
  if (!result.allowed) return rejectRateLimitedRequest(req, res, result.retryAfter, category);
  next();
};

export const aiRequestLimiter = createRequestLimiter({ limit: 20, windowMs: 60000 });
export const limitAiRequests = createRateLimitMiddleware({ limiter: aiRequestLimiter, category: 'customer_ai' });
