import { createClient } from '@supabase/supabase-js';

const getSupabaseConfig = () => ({
  url: process.env.SUPABASE_URL,
  anonKey: process.env.SUPABASE_ANON_KEY,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
});

const isPlaceholderValue = (value = '') => (
  /your-project-ref|your-anon-or-project-api-key|your-service-role-key/i.test(String(value).trim())
);

const isValidSupabaseUrl = (value = '') => {
  try {
    const url = new URL(String(value).trim());
    return url.protocol === 'https:' && url.hostname.endsWith('.supabase.co') && !isPlaceholderValue(value);
  } catch {
    return false;
  }
};

const hasValue = (value) => Boolean(String(value || '').trim()) && !isPlaceholderValue(value);

export const hasSupabasePublicConfig = () => {
  const { url, anonKey } = getSupabaseConfig();
  return isValidSupabaseUrl(url) && hasValue(anonKey);
};

export const hasSupabaseAdminConfig = () => {
  const { url, anonKey, serviceRoleKey } = getSupabaseConfig();
  return isValidSupabaseUrl(url) && hasValue(anonKey) && hasValue(serviceRoleKey);
};

export const isSupabaseConfigured = hasSupabaseAdminConfig;

const createConfigError = (requiredKeys) => {
  const error = new Error(
    `Supabase configuration is incomplete. Replace the placeholder values for ${requiredKeys.join(', ')} in dessert-ai-system/server/.env and restart the backend.`
  );
  error.status = 503;
  return error;
};

export const getSupabaseAdmin = () => {
  const { url, serviceRoleKey } = getSupabaseConfig();
  if (!isValidSupabaseUrl(url) || !hasValue(serviceRoleKey)) {
    throw createConfigError(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

export const getSupabaseAnon = (accessToken) => {
  const { url, anonKey } = getSupabaseConfig();
  if (!isValidSupabaseUrl(url) || !hasValue(anonKey)) {
    throw createConfigError(['SUPABASE_URL', 'SUPABASE_ANON_KEY']);
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: accessToken
      ? {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
      : undefined,
  });
};
