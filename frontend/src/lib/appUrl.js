import { normalizeBasePath } from './publicUrl';

const appBasePath = normalizeBasePath(import.meta.env.BASE_URL);

export const appUrl = (path = '') => {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const cleanedPath = String(path || '').replace(/^\/+/, '');

  return cleanedPath
    ? `${origin}${appBasePath}${cleanedPath}`
    : `${origin}${appBasePath}`;
};
