/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest, ApiError, isBackendIssueError } from '../lib/api';
import { TERMS_VERSION } from '../content/termsAndConditions';
import {supabase, isSupabaseConfigured, clearSupabaseSessionStorage, setRememberMePreference,
} from '../lib/supabase';
import { appUrl } from '../lib/appUrl';

const getAuthErrorMessage = (error) => {
  if (error instanceof ApiError) {
    return error.details?.errorCode === 'AUTH_EMAIL_DELIVERY_UNAVAILABLE'
      ? error.userMessage
      : error.message;
  }
  console.error('Authentication request failed:', error);
  return new ApiError(error?.message, error?.status || 500).message;
};

const AuthContext = createContext();
const PASSWORD_RECOVERY_STORAGE_KEY = 'vng-password-recovery-active';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

export const ROLE_DASHBOARD_PATHS = {
  customer: '/customer/dashboard',
  staff: '/staff/dashboard',
  admin: '/admin/dashboard',
};

export const getDashboardPathForRole = (role = 'customer') => (
  ROLE_DASHBOARD_PATHS[String(role || '').toLowerCase()] || ROLE_DASHBOARD_PATHS.customer
);

const hasRecoveryMarkerInLocation = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  const urlBits = `${window.location.search || ''}${window.location.hash || ''}`;
  return /(^|[?#&])type=recovery(?:[&#]|$)/i.test(urlBits);
};

const readPasswordRecoveryFlag = () => {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return false;
  }

  return window.sessionStorage.getItem(PASSWORD_RECOVERY_STORAGE_KEY) === '1';
};

const writePasswordRecoveryFlag = (isActive) => {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return;
  }

  if (isActive) {
    window.sessionStorage.setItem(PASSWORD_RECOVERY_STORAGE_KEY, '1');
  } else {
    window.sessionStorage.removeItem(PASSWORD_RECOVERY_STORAGE_KEY);
  }
};

const normalizeProfile = (profile, authUser = null) => ({
  id: profile?.id || authUser?.id || '',
  username: profile?.username || authUser?.user_metadata?.username || '',
  email: profile?.email || authUser?.email || '',
  fullName: profile?.fullName || profile?.full_name || authUser?.user_metadata?.full_name || '',
  role: profile?.role || 'customer',
  address: profile?.address || '',
  phoneNumber: profile?.phoneNumber || profile?.phone_number || '',
  avatarUrl: profile?.avatarUrl || profile?.avatar_url || authUser?.user_metadata?.avatar_url || '',
  termsAccepted: Boolean(
    profile?.termsAccepted
    ?? profile?.terms_accepted
    ?? authUser?.user_metadata?.terms_accepted
  ),
  termsAcceptedAt: profile?.termsAcceptedAt || profile?.terms_accepted_at || authUser?.user_metadata?.terms_accepted_at || '',
  termsVersion: profile?.termsVersion || profile?.terms_version || authUser?.user_metadata?.terms_version || '',
  emailVerified: Boolean(
    profile?.emailVerified
    ?? profile?.email_verified
    ?? authUser?.user_metadata?.email_verified
    ?? authUser?.email_confirmed_at
  ),
  emailVerifiedAt: profile?.emailVerifiedAt || profile?.email_verified_at || authUser?.user_metadata?.email_verified_at || authUser?.email_confirmed_at || '',
  lastLoginAt: profile?.lastLoginAt || profile?.last_login_at || '',
  createdAt: profile?.createdAt || profile?.created_at || authUser?.created_at || '',
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [staffAccounts, setStaffAccounts] = useState([]);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(
    () => readPasswordRecoveryFlag() || hasRecoveryMarkerInLocation()
  );

  const refreshProfile = useCallback(async (nextSession = null) => {
    if (!nextSession?.access_token) {
      setProfile(null);
      return null;
    }

    try {
      const nextProfile = await apiRequest('/api/profiles/me', {}, {
        auth: true,
        accessToken: nextSession.access_token,
      });

      const normalized = normalizeProfile(nextProfile, nextSession.user);
      setProfile(normalized);
      return normalized;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        if (supabase) {
          await supabase.auth.signOut();
        }
        setSession(null);
        setProfile(null);
        setStaffAccounts([]);
        return null;
      }
      throw error;
    }
  }, []);

  const fetchStaffAccounts = useCallback(async (nextSession = null) => {
    if (!nextSession?.access_token) {
      setStaffAccounts([]);
      return [];
    }

    const accounts = await apiRequest('/api/profiles/staff', {}, {
      auth: true,
      accessToken: nextSession.access_token,
    });

    const normalizedAccounts = (accounts || []).map((staff) => normalizeProfile(staff));
    setStaffAccounts(normalizedAccounts);
    return normalizedAccounts;
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setIsAuthLoading(false);
      return undefined;
    }

    let isActive = true;

    if (hasRecoveryMarkerInLocation()) {
      writePasswordRecoveryFlag(true);
      setIsPasswordRecovery(true);
    }

    const loadSession = async () => {
      let nextSession = null;

      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          throw error;
        }

        if (!isActive) {
          return;
        }

        nextSession = data.session || null;
        setSession(nextSession);
      } catch (error) {
        if (isBackendIssueError(error)) {
          console.warn('Auth session restore paused:', error.message);
        } else {
          console.error('Failed to restore auth session:', error);
        }
        clearSupabaseSessionStorage();
        if (isActive) {
          setSession(null);
          setProfile(null);
          setStaffAccounts([]);
        }
        return;
      }

      try {
        if (!nextSession) {
          if (isActive) {
            setProfile(null);
            setStaffAccounts([]);
          }
          return;
        }

        const nextProfile = await refreshProfile(nextSession);
        if (nextProfile?.role === 'admin') {
          await fetchStaffAccounts(nextSession);
        } else if (isActive) {
          setStaffAccounts([]);
        }
      } catch (error) {
        if (isBackendIssueError(error)) {
          console.warn('Profile refresh is unavailable right now:', error.message);
        } else {
          console.error('Failed to refresh profile after restoring auth session:', error);
        }
        if (isActive) {
          setStaffAccounts([]);
        }
      } finally {
        if (isActive) {
          setIsAuthLoading(false);
        }
      }
    };

    loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isActive) {
        return;
      }

      if (event === 'PASSWORD_RECOVERY') {
        writePasswordRecoveryFlag(true);
        setIsPasswordRecovery(true);
      } else if (event === 'SIGNED_OUT') {
        writePasswordRecoveryFlag(false);
        setIsPasswordRecovery(false);
      }

      if (event === 'TOKEN_REFRESH_FAILED') {
        console.warn('Supabase token refresh failed. Signing out.');
        supabase.auth.signOut().catch(() => {});
        setSession(null);
        setProfile(null);
        setStaffAccounts([]);
        setIsAuthLoading(false);
        return;
      }

      setSession(nextSession || null);
      setIsAuthLoading(true);

      queueMicrotask(async () => {
        try {
          if (!nextSession) {
            setProfile(null);
            setStaffAccounts([]);
            return;
          }

          const nextProfile = await refreshProfile(nextSession);
          if (nextProfile?.role === 'admin') {
            await fetchStaffAccounts(nextSession);
          } else {
            setStaffAccounts([]);
          }
        } catch (error) {
          if (isBackendIssueError(error)) {
            console.warn(`Auth event "${event}" is waiting on the backend:`, error.message);
          } else {
            console.error(`Failed to handle auth event "${event}":`, error);
          }
        } finally {
          if (isActive) {
            setIsAuthLoading(false);
          }
        }
      });
    });

    return () => {
      isActive = false;
      listener.subscription.unsubscribe();
    };
  }, [fetchStaffAccounts, refreshProfile]);

  const resolveLoginAccount = useCallback(async (identifier, allowedRoles = [], options = {}) => {
    const response = await apiRequest('/api/auth/resolve-login', {
      method: 'POST',
      body: JSON.stringify({
        identifier,
        ...(allowedRoles.length ? { allowed_roles: allowedRoles } : {}),
        ...(options.captchaId ? { captcha_id: options.captchaId } : {}),
        ...(options.captchaAnswer ? { captcha_answer: options.captchaAnswer } : {}),
        ...(Object.prototype.hasOwnProperty.call(options, 'captchaRequired')
          ? { captcha_required: options.captchaRequired }
          : {}),
        ...(options.allowLocked ? { allow_locked: true } : {}),
      }),
    });

    return response;
  }, []);

  const resolveLoginEmail = useCallback(async (identifier, allowedRoles = [], options = {}) => {
    const account = await resolveLoginAccount(identifier, allowedRoles, options);
    return account.email;
  }, [resolveLoginAccount]);

  const recordFailedLogin = useCallback(async (identifier) => {
    try {
      await apiRequest('/api/auth/login/failed', {
        method: 'POST',
        body: JSON.stringify({ identifier }),
      });
    } catch (error) {
      console.warn('Failed to record login attempt:', error);
    }
  }, []);

  const recordSuccessfulLogin = useCallback(async (accessToken) => {
    try {
      await apiRequest('/api/auth/login/success', {
        method: 'POST',
      }, {
        auth: true,
        accessToken,
      });
    } catch (error) {
      console.warn('Failed to record successful login:', error);
    }
  }, []);

  const loginUser = useCallback(async (identifier, password, options = {}) => {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, message: new ApiError('', 503).message };
    }

    const normalizedIdentifier = String(identifier || '').trim().toLowerCase();

    try {
      const rememberMe = options.rememberMe ?? true;
      const account = await resolveLoginAccount(normalizedIdentifier, options.allowedRoles || [], {
        captchaId: options.captchaId,
        captchaAnswer: options.captchaAnswer,
        captchaRequired: options.captchaRequired,
      });
      const email = String(account.email || '').trim().toLowerCase();

      if (account.role === 'customer' && !account.emailVerified) {
        return {
          success: false,
          requiresVerification: true,
          email,
          message: 'Please click the verification link sent to your email before logging in.',
        };
      }

      setRememberMePreference(rememberMe);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        await recordFailedLogin(normalizedIdentifier);
        if (/email not confirmed/i.test(error.message || '')) {
          return {
            success: false,
            requiresVerification: true,
            email,
            message: 'Please click the verification link sent to your email before logging in.',
          };
        }

        throw error;
      }

      const nextProfile = await refreshProfile(data.session);
      const allowedRoles = options.allowedRoles || [];
      if (!nextProfile || (allowedRoles.length > 0 && !allowedRoles.includes(nextProfile.role))) {
        await supabase.auth.signOut();
        return { success: false, message: 'This account does not have permission for that login.' };
      }

      await recordSuccessfulLogin(data.session?.access_token);

      if (nextProfile.role === 'admin') {
        await fetchStaffAccounts(data.session);
      } else {
        setStaffAccounts([]);
      }

      return {
        success: true,
        role: nextProfile.role,
        redirectTo: getDashboardPathForRole(nextProfile.role),
      };
    } catch (error) {
      return {
        success: false,
        message: getAuthErrorMessage(error),
      };
    }
  }, [fetchStaffAccounts, recordFailedLogin, recordSuccessfulLogin, refreshProfile, resolveLoginAccount]);

  const loginAdmin = useCallback((identifier, password) => (
    loginUser(identifier, password, { allowedRoles: ['admin', 'staff'], rememberMe: true, captchaRequired: false })
  ), [loginUser]);

  const loginCustomer = useCallback((identifier, password, options = {}) => (
    loginUser(identifier, password, { ...options, allowedRoles: ['customer'], captchaRequired: false })
  ), [loginUser]);

  const registerCustomer = useCallback(async ({
    username,
    email,
    password,
    fullName = '',
    address = '',
    phoneNumber = '',
    acceptedTerms = false,
    acceptedTermsAt = '',
    termsVersion = TERMS_VERSION,
    captchaId = '',
    captchaAnswer = '',
  }) => {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, message: new ApiError('', 503).message };
    }

    if (!acceptedTerms) {
      return { success: false, message: 'You must agree to the Terms and Conditions before creating an account.' };
    }

    try {
      const normalizedEmail = String(email || '').trim().toLowerCase();
      const normalizedUsername = String(username || '').trim().toLowerCase();
      const parsedAcceptedTermsAt = acceptedTermsAt ? new Date(acceptedTermsAt) : new Date();
      const normalizedAcceptedTermsAt = Number.isNaN(parsedAcceptedTermsAt.getTime())
        ? new Date().toISOString()
        : parsedAcceptedTermsAt.toISOString();
      const normalizedTermsVersion = String(termsVersion || TERMS_VERSION).trim() || TERMS_VERSION;

      const registration = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username: normalizedUsername,
          email: normalizedEmail,
          password,
          full_name: fullName,
          address,
          phone_number: phoneNumber,
          terms_accepted: true,
          terms_accepted_at: normalizedAcceptedTermsAt,
          terms_version: normalizedTermsVersion,
          captcha_id: captchaId,
          captcha_answer: captchaAnswer,
        }),
      });

      return {
        success: true,
        email: normalizedEmail,
        username: normalizedUsername,
        needsVerification: Boolean(registration?.needsVerification ?? true),
        autoLoggedIn: false,
        message: registration?.message || '',
        resendCooldownSeconds: Number(registration?.resendCooldownSeconds) || 35,
      };
    } catch (error) {
      return { success: false, message: getAuthErrorMessage(error) };
    }
  }, []);

  const resendCustomerSignupLink = useCallback(async (email) => {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, message: new ApiError('', 503).message };
    }

    try {
      const result = await apiRequest('/api/auth/register/resend-link', {
        method: 'POST',
        body: JSON.stringify({
          email: String(email || '').trim().toLowerCase(),
        }),
      });

      return {
        success: true,
        resendCooldownSeconds: Number(result?.resendCooldownSeconds) || 35,
      };
    } catch (error) {
      return {
        success: false,
        message: getAuthErrorMessage(error),
        cooldownSeconds: error instanceof ApiError ? error.details?.cooldownSeconds : undefined,
      };
    }
  }, []);

  const requestPasswordReset = useCallback(async (identifier, options = {}) => {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, message: new ApiError('', 503).message };
    }

    try {
      const email = await resolveLoginEmail(identifier, [], {
        captchaId: options.captchaId,
        captchaAnswer: options.captchaAnswer,
        captchaRequired: options.captchaRequired,
        allowLocked: true,
      });
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: appUrl('login'),
      });

      if (error) {
        throw error;
      }

      return { success: true, email };
    } catch (error) {
      return { success: false, message: getAuthErrorMessage(error) };
    }
  }, [resolveLoginEmail]);

  const verifyAdminResetCode = useCallback(async ({ identifier, code }) => {
    try {
      const result = await apiRequest('/api/auth/admin/verify-reset-code', {
        method: 'POST',
        body: JSON.stringify({
          identifier,
          code,
        }),
      });

      return {
        success: true,
        email: result.email,
      };
    } catch (error) {
      return {
        success: false,
        message: getAuthErrorMessage(error),
      };
    }
  }, []);

  const resetAdminPasswordWithCode = useCallback(async ({ identifier, code, password }) => {
    try {
      const result = await apiRequest('/api/auth/admin/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          identifier,
          code,
          password,
        }),
      });

      return {
        success: true,
        email: result.email,
      };
    } catch (error) {
      return {
        success: false,
        message: getAuthErrorMessage(error),
      };
    }
  }, []);

  const verifyPasswordRecoveryCode = useCallback(async (email, token) => {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, message: new ApiError('', 503).message };
    }

    try {
      const { error } = await supabase.auth.verifyOtp({
        email: String(email || '').trim().toLowerCase(),
        token: String(token || '').trim(),
        type: 'recovery',
      });

      if (error) {
        throw error;
      }

      writePasswordRecoveryFlag(true);
      setIsPasswordRecovery(true);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: getAuthErrorMessage(error),
      };
    }
  }, []);

  const completePasswordRecovery = useCallback(async (password) => {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, message: new ApiError('', 503).message };
    }

    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        throw sessionError;
      }

      await apiRequest('/api/auth/password/change', {
        method: 'POST',
        body: JSON.stringify({ password }),
      }, {
        auth: true,
        accessToken: data.session?.access_token,
      });

      writePasswordRecoveryFlag(false);
      setIsPasswordRecovery(false);
      await supabase.auth.signOut();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: getAuthErrorMessage(error),
      };
    }
  }, []);

  const updateMyProfile = useCallback(async (updates) => {
    if (!session?.access_token) {
      return null;
    }

    const nextProfile = await apiRequest('/api/profiles/me', {
      method: 'PUT',
      body: JSON.stringify({
        username: updates.username,
        full_name: updates.fullName,
        address: updates.address,
        phone_number: updates.phoneNumber,
        avatar_url: updates.avatarUrl,
      }),
    }, {
      auth: true,
      accessToken: session.access_token,
    });

    const normalized = normalizeProfile(nextProfile, session.user);
    setProfile(normalized);
    return normalized;
  }, [session]);

  const updateLoggedInCustomer = useCallback((updates) => (
    updateMyProfile(updates)
  ), [updateMyProfile]);

  const updateProfileFromSavedAddress = useCallback((address) => {
    setProfile((current) => current ? {
      ...current,
      address: address?.formattedAddress || '',
      phoneNumber: address?.phoneNumber || '',
    } : current);
  }, []);

  const createStaffAccount = useCallback(async (staffData) => {
    if (!session?.access_token) {
      throw new ApiError('You need to sign in first.', 401);
    }

    const createdStaff = await apiRequest('/api/profiles/staff', {
      method: 'POST',
      body: JSON.stringify({
        username: staffData.username,
        email: staffData.email,
        password: staffData.password,
        full_name: staffData.fullName,
        role: staffData.role || 'staff',
        address: staffData.address || '',
        phone_number: staffData.phoneNumber || '',
        avatar_url: staffData.avatarUrl || '',
      }),
    }, {
      auth: true,
      accessToken: session.access_token,
    });

    await fetchStaffAccounts(session);
    return normalizeProfile(createdStaff);
  }, [fetchStaffAccounts, session]);

  const deleteStaffAccount = useCallback(async (id) => {
    if (!session?.access_token) {
      throw new ApiError('You need to sign in first.', 401);
    }

    await apiRequest(`/api/profiles/staff/${id}`, {
      method: 'DELETE',
    }, {
      auth: true,
      accessToken: session.access_token,
    });

    await fetchStaffAccounts(session);
  }, [fetchStaffAccounts, session]);

  const updateStaffAccount = useCallback(async (id, staffData) => {
    if (!session?.access_token) {
      throw new ApiError('You need to sign in first.', 401);
    }

    const updatedStaff = await apiRequest(`/api/profiles/staff/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        username: staffData.username,
        email: staffData.email,
        full_name: staffData.fullName,
        role: staffData.role || 'staff',
        address: staffData.address || '',
        phone_number: staffData.phoneNumber || '',
        avatar_url: staffData.avatarUrl || '',
        ...(staffData.password && { password: staffData.password }),
      }),
    }, {
      auth: true,
      accessToken: session.access_token,
    });

    await fetchStaffAccounts(session);
    return normalizeProfile(updatedStaff);
  }, [fetchStaffAccounts, session]);

  const resetStaffPassword = useCallback(async (id, password) => {
    if (!session?.access_token) {
      throw new ApiError('You need to sign in first.', 401);
    }

    const result = await apiRequest(`/api/profiles/staff/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    }, {
      auth: true,
      accessToken: session.access_token,
    });

    await fetchStaffAccounts(session);
    return result;
  }, [fetchStaffAccounts, session]);

  const logout = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }

    writePasswordRecoveryFlag(false);
    setIsPasswordRecovery(false);
    setSession(null);
    setProfile(null);
    setStaffAccounts([]);
  }, []);

  useEffect(() => {
    if (!session?.access_token) {
      return undefined;
    }

    let timeoutId;
    const resetTimer = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        logout();
      }, SESSION_TIMEOUT_MS);
    };
    const activityEvents = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'];

    resetTimer();
    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, resetTimer, { passive: true });
    });

    return () => {
      window.clearTimeout(timeoutId);
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, resetTimer);
      });
    };
  }, [logout, session?.access_token]);

  const userRole = profile?.role || 'customer';
  const isAdmin = userRole === 'admin' || userRole === 'staff';
  const loggedInCustomer = profile && userRole === 'customer'
    ? {
        id: profile.id,
        username: profile.username,
        email: profile.email,
        fullName: profile.fullName,
        address: profile.address,
        phoneNumber: profile.phoneNumber,
        avatarUrl: profile.avatarUrl,
        emailVerified: profile.emailVerified,
      }
    : null;

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        isAuthLoading,
        isAdmin,
        userRole,
        staffAccounts,
        loggedInCustomer,
        loginUser,
        loginAdmin,
        loginCustomer,
        registerCustomer,
        resendCustomerSignupLink,
        requestPasswordReset,
        verifyAdminResetCode,
        resetAdminPasswordWithCode,
        verifyPasswordRecoveryCode,
        completePasswordRecovery,
        updateMyProfile,
        updateLoggedInCustomer,
        updateProfileFromSavedAddress,
        logout,
        createStaffAccount,
        updateStaffAccount,
        resetStaffPassword,
        deleteStaffAccount,
        refreshProfile,
        isPasswordRecovery,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
