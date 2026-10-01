// Public error policy: only actionable 4xx messages and known business fields may leave the error boundary.
export const httpErrorStatus = (status, fallback = 500) => {
  const value = Number(status);
  return Number.isInteger(value) && value >= 400 && value <= 599 ? value : fallback;
};

export const containsTechnicalDetails = (value = '') => (
  /permission denied for|row.level.security|violates.*constraint|\b(?:host|hostname|port|connection string|access token)\b/i.test(String(value)) ||
  /supabase|postgres|postgrest|paymongo|lalamove|railway|groq|smtp|gmail|sqlstate|\bdns\b|\bsql\b|\bapi\b|backend|database|schema|migration|stack\s*trace|\b(?:type|syntax|reference|aggregate)error\b|\b(?:ENOTFOUND|ECONN\w*|EACCES|ETIMEDOUT)\b|fetch failed|failed to fetch|environment variable|configuration|service.role|secret.key|api.key|\.env\b|https?:\/\/|[A-Z][A-Z0-9]+_[A-Z0-9_]+|(?:column|relation|table|constraint).*?(?:exist|cache|violat|missing)|invalid input syntax|\bat\s+\S+\s*\([^)]*:\d+|[<>]|(?:[A-Za-z]:\\|\/(?:api|server|src|node_modules)\/)/i.test(String(value))
);

const isAuthEmailDeliveryError = (errorCode, status) => (
  status === 503 && errorCode === 'AUTH_EMAIL_DELIVERY_UNAVAILABLE'
);
const isGmailRegistrationValidationError = (errorCode, status) => (
  status === 400 && errorCode === 'INVALID_GMAIL_REGISTRATION'
);
const isShopCustomerSupportMigrationError = (errorCode, status) => (
  status === 503 && errorCode === 'SHOP_CUSTOMER_SUPPORT_MIGRATION_REQUIRED'
);

export const publicErrorMessage = (message = '', status = 500, errorCode = '') => {
  const code = httpErrorStatus(status);
  if (isGmailRegistrationValidationError(errorCode, code)) {
    return 'Enter a correctly formatted Gmail address ending in @gmail.com.';
  }
  if (isAuthEmailDeliveryError(errorCode, code)) {
    return 'We could not send your verification email. Please try again later or contact the shop for help.';
  }
  if (isShopCustomerSupportMigrationError(errorCode, code)) {
    return 'Customer support settings need a database update. Ask the administrator to apply the shop customer support migration, then try again.';
  }
  const text = typeof message === 'string'
    ? message.replace(/^Error\s+\d{3}:\s*/i, '').trim()
    : '';
  if (code < 500 && text && text.length <= 400 && !containsTechnicalDetails(text)) return text;

  const messages = {
    400: 'Please check your information and try again.',
    401: 'Please sign in to continue.',
    403: 'You do not have permission to do that.',
    404: 'We could not find what you requested.',
    408: 'This is taking too long. Please try again.',
    409: 'This action cannot be completed right now. Please refresh and try again.',
    410: 'This is no longer available. Please refresh and try again.',
    413: 'The selected file or content is too large. Please choose a smaller one.',
    422: 'Please check your information and try again.',
    429: 'Too many attempts. Please wait a moment and try again.',
    502: 'This service is temporarily unavailable. Please try again shortly.',
    503: 'This service is temporarily unavailable. Please try again shortly.',
    504: 'This is taking too long. Please try again.',
  };
  return messages[code] || 'Something went wrong. Please try again later.';
};

// Keep the stock and verification information used by forms, never raw diagnostics.
export const publicErrorDetails = (value, status = 400) => {
  if (!value || typeof value !== 'object') return null;
  if (isGmailRegistrationValidationError(value.errorCode, httpErrorStatus(status))) {
    return { errorCode: 'INVALID_GMAIL_REGISTRATION' };
  }
  if (isAuthEmailDeliveryError(value.errorCode, httpErrorStatus(status))) {
    return { errorCode: 'AUTH_EMAIL_DELIVERY_UNAVAILABLE' };
  }
  if (isShopCustomerSupportMigrationError(value.errorCode, httpErrorStatus(status))) {
    return { errorCode: 'SHOP_CUSTOMER_SUPPORT_MIGRATION_REQUIRED' };
  }
  if (httpErrorStatus(status) >= 500) return null;
  const details = {};
  for (const key of ['attemptsRemaining', 'cooldownSeconds']) {
    if (typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= 0) {
      details[key] = value[key];
    }
  }
  if (Array.isArray(value.shortages)) {
    details.shortages = value.shortages.map((item) => ({
      productName: typeof item?.productName === 'string' && !containsTechnicalDetails(item.productName)
        ? item.productName.slice(0, 120) : 'Item',
      available: Math.max(0, Number(item?.available) || 0),
      requested: Math.max(0, Number(item?.requested) || 0),
    }));
  }
  return Object.keys(details).length ? details : null;
};
