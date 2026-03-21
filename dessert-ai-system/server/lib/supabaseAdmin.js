import { createClient } from '@supabase/supabase-js';

const getSupabaseConfig = () => ({
  url: process.env.SUPABASE_URL,
  anonKey: process.env.SUPABASE_ANON_KEY,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
});

export const isSupabaseConfigured = () => {
  const { url, anonKey, serviceRoleKey } = getSupabaseConfig();
  return Boolean(url && anonKey && serviceRoleKey);
};

const createMissingConfigError = () => new Error(
  'Supabase environment variables are missing. Set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.'
);

export const getSupabaseAdmin = () => {
  const { url, serviceRoleKey } = getSupabaseConfig();
  if (!url || !serviceRoleKey) {
    throw createMissingConfigError();
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
  if (!url || !anonKey) {
    throw createMissingConfigError();
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
