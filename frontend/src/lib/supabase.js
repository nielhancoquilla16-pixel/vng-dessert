import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const rawPasswordRecoveryMode = String(import.meta.env.VITE_PASSWORD_RECOVERY_MODE || '').trim().toLowerCase();
const supabaseProjectRef = (() => {
  try {
    return new URL(supabaseUrl).hostname.split('.')[0] || '';
  } catch {
    return '';
  }
})();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const passwordRecoveryMode = rawPasswordRecoveryMode === 'code' ? 'code' : 'link';
export const supabaseStorageKey = supabaseProjectRef
  ? `sb-${supabaseProjectRef}-auth-token`
  : '';

export const clearSupabaseSessionStorage = () => {
  if (typeof window === 'undefined' || !window.localStorage || !supabaseStorageKey) {
    return;
  }

  window.localStorage.removeItem(supabaseStorageKey);
  window.localStorage.removeItem(`${supabaseStorageKey}-code-verifier`);
};

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;
