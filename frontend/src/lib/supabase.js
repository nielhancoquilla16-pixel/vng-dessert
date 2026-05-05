import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const rawPasswordRecoveryMode = String(import.meta.env.VITE_PASSWORD_RECOVERY_MODE || '').trim().toLowerCase();
const REMEMBER_ME_STORAGE_KEY = 'vng-auth-remember-me';
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

const getStorage = (storageName) => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window[storageName] || null;
  } catch {
    return null;
  }
};

const safeGetItem = (storage, key) => {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

const safeSetItem = (storage, key, value) => {
  try {
    storage?.setItem(key, value);
  } catch {
    // Ignore storage write failures in restricted browser modes.
  }
};

const safeRemoveItem = (storage, key) => {
  try {
    storage?.removeItem(key);
  } catch {
    // Ignore storage cleanup failures in restricted browser modes.
  }
};

export const getRememberMePreference = () => {
  const localStorageRef = getStorage('localStorage');
  return safeGetItem(localStorageRef, REMEMBER_ME_STORAGE_KEY) !== '0';
};

export const setRememberMePreference = (isEnabled) => {
  const localStorageRef = getStorage('localStorage');
  if (!localStorageRef) {
    return;
  }

  safeSetItem(localStorageRef, REMEMBER_ME_STORAGE_KEY, isEnabled ? '1' : '0');
};

export const clearSupabaseSessionStorage = () => {
  if (!supabaseStorageKey) {
    return;
  }

  const localStorageRef = getStorage('localStorage');
  const sessionStorageRef = getStorage('sessionStorage');

  safeRemoveItem(localStorageRef, supabaseStorageKey);
  safeRemoveItem(localStorageRef, `${supabaseStorageKey}-code-verifier`);
  safeRemoveItem(sessionStorageRef, supabaseStorageKey);
  safeRemoveItem(sessionStorageRef, `${supabaseStorageKey}-code-verifier`);
};

const authStorage = {
  getItem(key) {
    const rememberMe = getRememberMePreference();
    const localStorageRef = getStorage('localStorage');
    const sessionStorageRef = getStorage('sessionStorage');
    const primaryStorage = rememberMe ? localStorageRef : sessionStorageRef;
    const fallbackStorage = rememberMe ? sessionStorageRef : (!primaryStorage ? localStorageRef : null);

    return safeGetItem(primaryStorage, key) ?? safeGetItem(fallbackStorage, key);
  },
  setItem(key, value) {
    const rememberMe = getRememberMePreference();
    const localStorageRef = getStorage('localStorage');
    const sessionStorageRef = getStorage('sessionStorage');
    const primaryStorage = rememberMe
      ? (localStorageRef || sessionStorageRef)
      : (sessionStorageRef || localStorageRef);
    const secondaryStorage = rememberMe ? sessionStorageRef : localStorageRef;

    safeSetItem(primaryStorage, key, value);
    if (secondaryStorage && secondaryStorage !== primaryStorage) {
      safeRemoveItem(secondaryStorage, key);
    }
  },
  removeItem(key) {
    const localStorageRef = getStorage('localStorage');
    const sessionStorageRef = getStorage('sessionStorage');

    safeRemoveItem(localStorageRef, key);
    safeRemoveItem(sessionStorageRef, key);
  },
};

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: supabaseStorageKey || undefined,
        storage: authStorage,
      },
    })
  : null;
