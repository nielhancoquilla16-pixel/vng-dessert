const ABSOLUTE_URL_PATTERN = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

export const normalizeBasePath = (value = '/') => {
  const trimmed = String(value || '/').trim();

  if (!trimmed || trimmed === '/') {
    return '/';
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
};

const assetBasePath = normalizeBasePath(import.meta.env.BASE_URL);

const resolveWithBasePath = (path = '') => {
  const cleanedPath = String(path || '').replace(/^\/+/, '');
  return cleanedPath ? `${assetBasePath}${cleanedPath}` : assetBasePath;
};

const isAbsoluteAssetUrl = (value = '') => (
  ABSOLUTE_URL_PATTERN.test(String(value || '').trim())
);

const isDataOrBlobUrl = (value = '') => {
  const trimmed = String(value || '').trim();
  return /^data:/i.test(trimmed) || /^blob:/i.test(trimmed);
};

export const resolveAssetUrl = (value, fallback = '') => {
  const candidate = String(value || '').trim() || String(fallback || '').trim();

  if (!candidate) {
    return '';
  }

  if (isAbsoluteAssetUrl(candidate) || isDataOrBlobUrl(candidate)) {
    return candidate;
  }

  return resolveWithBasePath(candidate);
};

export const publicUrl = resolveWithBasePath;
