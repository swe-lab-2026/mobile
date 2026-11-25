import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authApi from '../api/auth';
import { setSessionHandlers } from '../api/client';
import { AuthUser } from '../types/auth';

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isPlatformAdmin: boolean;
  isInitializing: boolean;
  /** True when a stored session could not be restored for a transient reason (e.g. offline). */
  initializationError: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-reads /users/me, e.g. after the profile was edited. */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initializationError, setInitializationError] = useState(false);

  useEffect(() => {
    let active = true;

    setSessionHandlers({
      refresh: authApi.refreshAccessToken,
      onExpired: authApi.clearLocalSession,
    });
    authApi.setSessionInvalidatedHandler(() => {
      if (active) setUser(null);
    });

    authApi
      .restoreSession()
      .then((restoredUser) => {
        if (active) setUser(restoredUser);
      })
      .catch(() => {
        if (active) {
          setInitializationError(true);
        }
      })
      .finally(() => {
        if (active) setIsInitializing(false);
      });

    return () => {
      active = false;
      setSessionHandlers(null);
      authApi.setSessionInvalidatedHandler(null);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setInitializationError(false);
    const loggedInUser = await authApi.login({ email, password });
    setUser(loggedInUser);
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    await authApi.logout();
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      setUser(await authApi.getCurrentUser());
    } catch {
      // Keep the current user; session errors are handled by the API client.
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: !!user,
      isPlatformAdmin: user?.globalRole === 'PLATFORM_ADMIN',
      isInitializing,
      initializationError,
      login,
      logout,
      refreshUser,
    }),
    [user, isInitializing, initializationError, login, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return ctx;
}