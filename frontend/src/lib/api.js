import { supabase, isSupabaseConfigured } from './supabase';
import { httpErrorStatus, publicErrorDetails, publicErrorMessage } from './publicErrors';

export const normalizeApiErrorMessage = publicErrorMessage;

const rawApiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim();
const sanitizeApiBaseUrl = (value = '') => String(value || '').trim().replace(/^['"]|['"]$/g, '');
const localBrowserHost = typeof window === 'undefined' ? 'localhost' : (window.location.hostname || 'localhost');
const devFallbackBase = `http://${localBrowserHost}:3001`;
const resolveDevApiBaseUrl = (value = '') => {
  const baseUrl = sanitizeApiBaseUrl(value);
  if (!baseUrl) return '';

  try {
    const parsed = new URL(baseUrl);
    if (
      ['localhost', '127.0.0.1'].includes(parsed.hostname)
      && !['localhost', '127.0.0.1'].includes(localBrowserHost)
    ) {
      parsed.hostname = localBrowserHost;
    }
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return baseUrl;
  }
};
const productionFallbackBase = 'https://dessert-ai-backend-production-5c00.up.railway.app';
const configuredApiBases = Array.from(new Set(
  (
    import.meta.env.DEV
      ? [
          resolveDevApiBaseUrl(rawApiBaseUrl),
          resolveDevApiBaseUrl(devFallbackBase),
        ]
      : [
          sanitizeApiBaseUrl(rawApiBaseUrl) || sanitizeApiBaseUrl(productionFallbackBase),
        ]
  ).filter(Boolean),
)).map((baseUrl) => baseUrl.replace(/\/$/, ''));
const BACKEND_RETRY_DELAY_MS = import.meta.env.DEV ? 2000 : 1500;
const BACKEND_STARTUP_GRACE_MS = import.meta.env.DEV ? 4000 : 45000;
const BACKEND_HEALTH_POLL_MS = import.meta.env.DEV ? 400 : 1500;
let backendUnavailableUntil = 0;
let backendRecoveryPromise = null;
let apiStatus = {
  level: 'idle',
  message: '',
};
const apiStatusListeners = new Set();

export let API_BASE_URL = configuredApiBases[0] || sanitizeApiBaseUrl(
  import.meta.env.DEV ? devFallbackBase : productionFallbackBase,
).replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, status = 500, details = null) {
    const code = httpErrorStatus(status);
    const safeMessage = publicErrorMessage(message, code, details?.errorCode);
    super(`Error ${code}: ${safeMessage}`);
    this.name = 'ApiError';
    this.status = code;
    this.userMessage = safeMessage;
    this.details = publicErrorDetails(details, code);
  }
}

const setApiStatus = (nextStatus) => {
  if (
    apiStatus.level === nextStatus.level
    && apiStatus.message === nextStatus.message
    && apiStatus.code === nextStatus.code
    && apiStatus.source === nextStatus.source
    && apiStatus.path === nextStatus.path
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
  error instanceof ApiError && error.status >= 500
);

const buildUrl = (path = '', baseUrl = API_BASE_URL) => (
  path.startsWith('http')
    ? path
    : `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`
);

const setApiBaseUrl = (nextBaseUrl = '') => {
  const normalizedBaseUrl = sanitizeApiBaseUrl(nextBaseUrl).replace(/\/$/, '');
  if (!normalizedBaseUrl || API_BASE_URL === normalizedBaseUrl) {
    return;
  }

  API_BASE_URL = normalizedBaseUrl;
};

const getApiBaseCandidates = () => (
  [API_BASE_URL, ...configuredApiBases.filter((baseUrl) => baseUrl !== API_BASE_URL)]
);

const parseResponseData = async (response) => {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return response.text();
  try {
    return await response.json();
  } catch (error) {
    console.error('Unable to read the response:', error);
    // A malformed error body must not replace its actual HTTP status with 503.
    if (!response.ok) return null;
    throw error;
  }
};

const isRailwayAppNotFoundResponse = (response, responseData) => {
  if (response.status !== 404) {
    return false;
  }

  const message = typeof responseData === 'object'
    ? `${responseData?.message || ''} ${responseData?.error || ''}`.trim()
    : extractTextErrorMessage(responseData);

  return /Application not found/i.test(message);
};

const isMissingApiRouteResponse = (response, responseData) => {
  if (response.status !== 404) {
    return false;
  }

  const message = typeof responseData === 'object'
    ? `${responseData?.message || ''} ${responseData?.error || ''}`.trim()
    : extractTextErrorMessage(responseData);

  return /^Cannot\s+(GET|POST|PUT|PATCH|DELETE)\s+\/api\//i.test(message);
};

const fetchApiResponse = async (path, options = {}) => {
  const candidates = getApiBaseCandidates();
  let lastNetworkError = null;
  let unavailableResponse = null;

  for (const baseUrl of candidates) {
    try {
      const response = await fetch(buildUrl(path, baseUrl), options);
      const responseData = await parseResponseData(response);

      if (isRailwayAppNotFoundResponse(response, responseData)) {
        unavailableResponse = { response, responseData };
        continue;
      }

      if (isMissingApiRouteResponse(response, responseData)) {
        unavailableResponse = { response, responseData };
        continue;
      }

      setApiBaseUrl(baseUrl);
      return { response, responseData };
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

      lastNetworkError = error;
    }
  }

  if (unavailableResponse) return unavailableResponse;
  throw lastNetworkError || new ApiError('', 503);
};

const isClientOffline = () => (
  typeof navigator !== 'undefined'
  && typeof navigator.onLine === 'boolean'
  && !navigator.onLine
);

const getBackendRecoveryMessage = () => (
  isClientOffline()
    ? 'You appear to be offline. Reconnect to the internet and try again.'
    : 'Reconnecting. Please wait a moment.'
);

const getBackendUnavailableMessage = () => publicErrorMessage('', 503);

const wait = (ms) => new Promise((resolve) => {
  window.setTimeout(resolve, ms);
});

const isAbortError = (error) => (
  error?.name === 'AbortError'
);

export const probeApiHealth = async () => {
  const { response, responseData } = await fetchApiResponse('/api/health', {
    method: 'GET',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new ApiError('', response.status);
  }

  backendUnavailableUntil = 0;
  if (apiStatus.source === 'network') setApiStatus({ level: 'idle', message: '' });
  return responseData;
};

const recoverBackendConnection = () => {
  if (!backendRecoveryPromise) {
    backendRecoveryPromise = (async () => {
      setApiStatus({
        level: 'warning',
        message: getBackendRecoveryMessage(),
        code: 503,
        source: 'network',
      });

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
    throw new ApiError(error.message, error.status || 503);
  }

  return data.session?.access_token || '';
};

export const apiRequest = async (path, options = {}, config = {}) => {
  if (backendUnavailableUntil && Date.now() < backendUnavailableUntil) {
    const message = getBackendUnavailableMessage();
    setApiStatus({
      level: isClientOffline() ? 'warning' : 'error',
      message,
      code: 503,
      source: 'network',
    });
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
  let responseData;

  try {
    ({ response, responseData } = await fetchApiResponse(path, {
      ...options,
      headers,
    }));
    backendUnavailableUntil = 0;
    if (response.ok && (apiStatus.source === 'network' || apiStatus.path === path)) {
      setApiStatus({ level: 'idle', message: '' });
    }
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

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
    const message = getBackendUnavailableMessage();
    setApiStatus({
      level: isClientOffline() ? 'warning' : 'error',
      message,
      code: 503,
      source: 'network',
    });
    throw new ApiError(message, 503, error);
  }

  if (response.status === 204) {
    return null;
  }

  if (!response.ok) {
    const responseMessage = typeof responseData === 'object'
      ? responseData?.error || responseData?.message || ''
      : '';
    const rawMessage = responseMessage
      || (typeof responseData === 'string' ? extractTextErrorMessage(responseData) : '');
    const message = normalizeApiErrorMessage(rawMessage, response.status, responseData?.errorCode);
    const isVerificationEmailFailure = response.status === 503
      && responseData?.errorCode === 'AUTH_EMAIL_DELIVERY_UNAVAILABLE'
      && ['/api/auth/register', '/api/auth/register/resend-link'].includes(path);

    // The signup form displays this failure; the rest of the shop is still available.
    if (response.status >= 500 && !isVerificationEmailFailure) {
      setApiStatus({ level: 'error', code: response.status, message, source: 'response', path });
    }

    throw new ApiError(message, response.status, responseData);
  }

  return responseData;
};
