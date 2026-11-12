import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthUser } from '../types/auth';
import * as authApi from '../api/auth';
import { setSessionHandlers } from '../api/client';

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isPlatformAdmin: boolean;
  isInitializing: boolean;
  initializationError: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initializationError, setInitializationError] = useState<string | null>(null);

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
          setInitializationError(
            'Could not restore your previous session. Check your connection and sign in again.',
          );
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
    setInitializationError(null);
    const loggedInUser = await authApi.login({ email, password });
    setUser(loggedInUser);
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    await authApi.logout();
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
    }),
    [user, isInitializing, initializationError, login, logout],
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
