/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest, ApiError, isBackendIssueError } from '../lib/api';
import { TERMS_VERSION } from '../content/termsAndConditions';
import { supabase, isSupabaseConfigured, clearSupabaseSessionStorage } from '../lib/supabase';
import { appUrl } from '../lib/appUrl';

const AuthContext = createContext();
const PASSWORD_RECOVERY_STORAGE_KEY = 'vng-password-recovery-active';

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
  createdAt: profile?.createdAt || profile?.created_at || authUser?.created_at || '',
});

const isMissingRegisterCheckRouteError = (error) => (
  error instanceof ApiError
  && error.status === 404
  && /Cannot POST \/api\/auth\/register\/check/i.test(
    `${error.message || ''} ${typeof error.details === 'string' ? error.details : ''}`
  )
);

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

  const resolveLoginEmail = useCallback(async (identifier) => {
    const response = await apiRequest('/api/auth/resolve-login', {
      method: 'POST',
      body: JSON.stringify({ identifier }),
    });

    return response.email;
  }, []);

  const signInWithRole = useCallback(async (identifier, password, allowedRoles) => {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, message: 'Supabase is not configured yet. Add your frontend env keys first.' };
    }

    try {
      const email = await resolveLoginEmail(identifier);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (/email not confirmed/i.test(error.message || '')) {
          return {
            success: false,
            requiresVerification: true,
            email,
            message: 'Please enter the 6-digit verification code sent to your email before logging in.',
          };
        }

        throw error;
      }

      const nextProfile = await refreshProfile(data.session);
      if (!nextProfile || !allowedRoles.includes(nextProfile.role)) {
        await supabase.auth.signOut();
        return { success: false, message: 'This account does not have permission for that login.' };
      }

      if (nextProfile.role === 'admin') {
        await fetchStaffAccounts(data.session);
      }

      return { success: true, role: nextProfile.role };
    } catch (error) {
      return {
        success: false,
        message: error instanceof ApiError ? error.message : (error.message || 'Unable to sign in right now.'),
      };
    }
  }, [fetchStaffAccounts, refreshProfile, resolveLoginEmail]);

  const loginAdmin = useCallback((identifier, password) => (
    signInWithRole(identifier, password, ['admin', 'staff'])
  ), [signInWithRole]);

  const loginCustomer = useCallback((identifier, password) => (
    signInWithRole(identifier, password, ['customer'])
  ), [signInWithRole]);

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
  }) => {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, message: 'Supabase is not configured yet. Add your frontend env keys first.' };
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

      try {
        await apiRequest('/api/auth/register/check', {
          method: 'POST',
          body: JSON.stringify({
            username: normalizedUsername,
            email: normalizedEmail,
          }),
        });
      } catch (error) {
        if (!isMissingRegisterCheckRouteError(error)) {
          throw error;
        }

        await apiRequest('/api/auth/register', {
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
          }),
        });

        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (signInError) {
          return {
            success: true,
            email: normalizedEmail,
            username: normalizedUsername,
            needsVerification: false,
            autoLoggedIn: false,
            message: 'Account created successfully. Please log in with your new account.',
          };
        }

        if (data.session) {
          setSession(data.session);
          try {
            await refreshProfile(data.session);
          } catch (profileError) {
            console.warn('Created account, but profile sync will finish after sign-in settles:', profileError);
          }
        }

        return {
          success: true,
          email: normalizedEmail,
          username: normalizedUsername,
          needsVerification: false,
          autoLoggedIn: true,
        };
      }

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: appUrl('login'),
          data: {
            username: normalizedUsername,
            full_name: fullName,
            address,
            phone_number: phoneNumber,
            terms_accepted: true,
            terms_accepted_at: normalizedAcceptedTermsAt,
            terms_version: normalizedTermsVersion,
          },
        },
      });

      if (error) {
        throw error;
      }

      return {
        success: true,
        email: normalizedEmail,
        username: normalizedUsername,
        needsVerification: !data.session,
        autoLoggedIn: Boolean(data.session),
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof ApiError ? error.message : (error.message || 'Unable to create the account right now.'),
      };
    }
  }, [refreshProfile]);

  const verifyCustomerSignupCode = useCallback(async (email, token) => {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, message: 'Supabase is not configured yet. Add your frontend env keys first.' };
    }

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: String(email || '').trim().toLowerCase(),
        token: String(token || '').trim(),
        type: 'email',
      });

      if (error) {
        throw error;
      }

      const nextProfile = await refreshProfile(data.session);
      return {
        success: true,
        profile: nextProfile,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof ApiError ? error.message : (error.message || 'Unable to verify the code right now.'),
      };
    }
  }, [refreshProfile]);

  const resendCustomerSignupCode = useCallback(async (email) => {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, message: 'Supabase is not configured yet. Add your frontend env keys first.' };
    }

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: String(email || '').trim().toLowerCase(),
        options: {
          emailRedirectTo: appUrl('login'),
        },
      });

      if (error) {
        throw error;
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error instanceof ApiError ? error.message : (error.message || 'Unable to resend the code right now.'),
      };
    }
  }, []);

  const requestPasswordReset = useCallback(async (identifier) => {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, message: 'Supabase is not configured yet. Add your frontend env keys first.' };
    }

    try {
      const email = await resolveLoginEmail(identifier);
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: appUrl('login'),
      });

      if (error) {
        throw error;
      }

      return { success: true, email };
    } catch (error) {
      return {
        success: false,
        message: error instanceof ApiError ? error.message : (error.message || 'Unable to send the recovery email right now.'),
      };
    }
  }, [resolveLoginEmail]);

  const verifyPasswordRecoveryCode = useCallback(async (email, token) => {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, message: 'Supabase is not configured yet. Add your frontend env keys first.' };
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
        message: error instanceof ApiError ? error.message : (error.message || 'Unable to verify the recovery code right now.'),
      };
    }
  }, []);

  const completePasswordRecovery = useCallback(async (password) => {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, message: 'Supabase is not configured yet. Add your frontend env keys first.' };
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        throw error;
      }

      writePasswordRecoveryFlag(false);
      setIsPasswordRecovery(false);
      await supabase.auth.signOut();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error instanceof ApiError ? error.message : (error.message || 'Unable to update the password right now.'),
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
        loginAdmin,
        loginCustomer,
        registerCustomer,
        verifyCustomerSignupCode,
        resendCustomerSignupCode,
        requestPasswordReset,
        verifyPasswordRecoveryCode,
        completePasswordRecovery,
        updateMyProfile,
        updateLoggedInCustomer,
        logout,
        createStaffAccount,
        updateStaffAccount,
        deleteStaffAccount,
        refreshProfile,
        isPasswordRecovery,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
