import { supabase, isSupabaseConfigured } from './supabase';

const rawApiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim();
const devFallbackBase = 'http://localhost:3001';
const productionFallbackBase = 'https://vng-dessert-backend-production.up.railway.app';
const resolvedBase = rawApiBaseUrl || (import.meta.env.DEV ? devFallbackBase : productionFallbackBase);

const BACKEND_RETRY_DELAY_MS = 5000;
const BACKEND_STARTUP_GRACE_MS = 4000;
const BACKEND_HEALTH_POLL_MS = 400;
let backendUnavailableUntil = 0;
let backendRecoveryPromise = null;
let apiStatus = {
  level: 'idle',
  message: '',
};
const apiStatusListeners = new Set();

export const API_BASE_URL = resolvedBase.replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, status = 500, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

const setApiStatus = (nextStatus) => {
  if (
    apiStatus.level === nextStatus.level
    && apiStatus.message === nextStatus.message
  ) {
    return;
  }

  apiStatus = nextStatus;
  apiStatusListeners.forEach((listener) => listener(apiStatus));
};

export const getApiStatus = () => apiStatus;
export const clearApiStatus = () => {
  backendUnavailableUntil = 0;
  setApiStatus({ level: 'idle', message: '' });
};

export const subscribeToApiStatus = (listener) => {
  apiStatusListeners.add(listener);
  return () => {
    apiStatusListeners.delete(listener);
  };
};

export const normalizeApiErrorMessage = (message = '') => {
  if (/SUPABASE_SERVICE_ROLE_KEY|Supabase environment variables are missing/i.test(message)) {
    return 'Backend configuration is incomplete. Add SUPABASE_SERVICE_ROLE_KEY to dessert-ai-system/server/.env and restart the backend.';
  }

  if (/Supabase configuration is incomplete|placeholder values|could not reach Supabase|getaddrinfo ENOTFOUND|TypeError: fetch failed/i.test(message)) {
    return 'Backend Supabase setup is incomplete. Update dessert-ai-system/server/.env with the real SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY, then restart the backend.';
  }

  return message;
};

const extractTextErrorMessage = (value = '') => {
  const message = String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^Error\s+/i, '');

  return message || 'Request failed.';
};

export const isBackendIssueError = (error) => (
  error instanceof ApiError
  && (
    error.status === 503
    || error.status >= 500
    || /SUPABASE_SERVICE_ROLE_KEY|Supabase environment variables are missing|Supabase configuration is incomplete|could not reach Supabase/i.test(error.message || '')
  )
);

const buildUrl = (path = '') => (
  path.startsWith('http')
    ? path
    : `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
);

export const isBackendUnavailableMessage = (message = '') => (
  /Backend server is temporarily unavailable|Backend server is unavailable/i.test(message)
);

const wait = (ms) => new Promise((resolve) => {
  window.setTimeout(resolve, ms);
});

export const probeApiHealth = async () => {
  const response = await fetch(buildUrl('/api/health'), {
    method: 'GET',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new ApiError('Backend health check failed.', response.status);
  }

  backendUnavailableUntil = 0;
  setApiStatus({ level: 'idle', message: '' });
  return response.json();
};

const recoverBackendConnection = () => {
  if (!backendRecoveryPromise) {
    backendRecoveryPromise = (async () => {
      const deadline = Date.now() + BACKEND_STARTUP_GRACE_MS;

      while (Date.now() < deadline) {
        try {
          await probeApiHealth();
          return true;
        } catch {
          await wait(BACKEND_HEALTH_POLL_MS);
        }
      }

      return false;
    })().finally(() => {
      backendRecoveryPromise = null;
    });
  }

  return backendRecoveryPromise;
};

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
  if (backendUnavailableUntil && Date.now() < backendUnavailableUntil) {
    const message = import.meta.env.DEV
      ? 'Backend server is temporarily unavailable. Please make sure dessert-ai-system is running on port 3001.'
      : 'Backend server is temporarily unavailable. Please check the Railway backend and try again.';
    setApiStatus({ level: 'error', message });
    throw new ApiError(message, 503);
  }

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
    backendUnavailableUntil = 0;
    setApiStatus({ level: 'idle', message: '' });
  } catch (error) {
    if (!config.skipRecovery) {
      const recovered = await recoverBackendConnection();
      if (recovered) {
        return apiRequest(path, options, {
          ...config,
          skipRecovery: true,
        });
      }
    }

    backendUnavailableUntil = Date.now() + BACKEND_RETRY_DELAY_MS;
    const message = import.meta.env.DEV
      ? 'Backend server is temporarily unavailable. Please start dessert-ai-system on port 3001 and try again.'
      : 'Backend server is unavailable. Check the Railway backend or set VITE_API_BASE_URL.';
    setApiStatus({ level: 'error', message });
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
    const rawMessage = typeof responseData === 'object' && responseData?.error
      ? responseData.error
      : typeof responseData === 'string'
        ? extractTextErrorMessage(responseData)
      : 'Request failed.';
    const message = normalizeApiErrorMessage(rawMessage);

    if (response.status >= 500) {
      setApiStatus({ level: 'error', message });
    }

    throw new ApiError(message, response.status, responseData);
  }

  return responseData;
};
