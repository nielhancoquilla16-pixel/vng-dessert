import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest, ApiError } from '../lib/api';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const AuthContext = createContext();

const normalizeProfile = (profile, authUser = null) => ({
  id: profile?.id || authUser?.id || '',
  username: profile?.username || authUser?.user_metadata?.username || '',
  email: profile?.email || authUser?.email || '',
  fullName: profile?.fullName || profile?.full_name || authUser?.user_metadata?.full_name || '',
  role: profile?.role || 'customer',
  address: profile?.address || '',
  phoneNumber: profile?.phoneNumber || profile?.phone_number || '',
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

  const refreshProfile = useCallback(async (nextSession = null) => {
    if (!nextSession?.access_token) {
      setProfile(null);
      return null;
    }

    const nextProfile = await apiRequest('/api/profiles/me', {}, {
      auth: true,
      accessToken: nextSession.access_token,
    });

    const normalized = normalizeProfile(nextProfile, nextSession.user);
    setProfile(normalized);
    return normalized;
  }, []);

  const fetchStaffAccounts = useCallback(async (nextSession = session) => {
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
  }, [session]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setIsAuthLoading(false);
      return undefined;
    }

    let isActive = true;

    const loadSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          throw error;
        }

        if (!isActive) {
          return;
        }

        const nextSession = data.session || null;
        setSession(nextSession);

        if (nextSession) {
          const nextProfile = await refreshProfile(nextSession);
          if (nextProfile?.role === 'admin') {
            await fetchStaffAccounts(nextSession);
          } else if (isActive) {
            setStaffAccounts([]);
          }
        }
      } catch (error) {
        console.error('Failed to restore auth session:', error);
        if (isActive) {
          setProfile(null);
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
          console.error(`Failed to handle auth event "${event}":`, error);
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

  const registerCustomer = useCallback(async ({ username, email, password, fullName = '', address = '', phoneNumber = '' }) => {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, message: 'Supabase is not configured yet. Add your frontend env keys first.' };
    }

    try {
      await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username,
          email,
          password,
          full_name: fullName,
          address,
          phone_number: phoneNumber,
        }),
      });

      return await signInWithRole(username, password, ['customer']);
    } catch (error) {
      return {
        success: false,
        message: error instanceof ApiError ? error.message : (error.message || 'Unable to create the account right now.'),
      };
    }
  }, [signInWithRole]);

  const requestPasswordReset = useCallback(async (identifier) => {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, message: 'Supabase is not configured yet. Add your frontend env keys first.' };
    }

    try {
      const email = await resolveLoginEmail(identifier);
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`,
      });

      if (error) {
        throw error;
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error instanceof ApiError ? error.message : (error.message || 'Unable to send the reset link right now.'),
      };
    }
  }, [resolveLoginEmail]);

  const updateLoggedInCustomer = useCallback(async (updates) => {
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
      }),
    }, {
      auth: true,
      accessToken: session.access_token,
    });

    const normalized = normalizeProfile(nextProfile, session.user);
    setProfile(normalized);
    return normalized;
  }, [session]);

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

  const logout = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }

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
        requestPasswordReset,
        updateLoggedInCustomer,
        logout,
        createStaffAccount,
        deleteStaffAccount,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
