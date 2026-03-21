import { supabase, isSupabaseConfigured } from './supabase';

const rawApiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim();
const devFallbackBase = 'http://localhost:3001';
const resolvedBase = rawApiBaseUrl || (import.meta.env.DEV ? devFallbackBase : '');

export const API_BASE_URL = resolvedBase.replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, status = 500, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

const buildUrl = (path = '') => (
  path.startsWith('http')
    ? path
    : `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
);

const getSessionAccessToken = async () => {
  if (!isSupabaseConfigured || !supabase) {
    return '';
  }

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session?.access_token || '';
};

export const apiRequest = async (path, options = {}, config = {}) => {
  const headers = new Headers(options.headers || {});
  const needsJson = !(options.body instanceof FormData);

  if (needsJson && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (config.auth) {
    const accessToken = config.accessToken || await getSessionAccessToken();
    if (!accessToken) {
      throw new ApiError('You need to sign in first.', 401);
    }

    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  let response;

  try {
    response = await fetch(buildUrl(path), {
      ...options,
      headers,
    });
  } catch (error) {
    const message = rawApiBaseUrl
      ? 'Backend server is unavailable. Please start it and try again.'
      : 'Backend server is unavailable. Start dessert-ai-system on port 3001 or set VITE_API_BASE_URL.';
    throw new ApiError(message, 503, error);
  }

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  const responseData = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = typeof responseData === 'object' && responseData?.error
      ? responseData.error
      : 'Request failed.';
    throw new ApiError(message, response.status, responseData);
  }

  return responseData;
};
