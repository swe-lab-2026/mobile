import React, { createContext, useContext, useMemo, useState, useCallback, useRef, useEffect} from 'react';
import * as SecureStore from 'expo-secure-store';
import * as authApi from '../api/auth';
import { ApiError, setAccessToken, setSessionHandlers } from '../api/client';

const REFRESH_KEY = 'refresh_token';

interface AuthContextValue {
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const inFlight = useRef<Promise<string | null> | null>(null);

  const clearSession = useCallback(async () => {
    setAccessToken(null);
    setAuthenticated(false);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  }, []);

  const saveTokens = useCallback(async (t: { access_token: string; refresh_token: string }) => {
    await SecureStore.setItemAsync(REFRESH_KEY, t.refresh_token); // save BEFORE using it again
    setAccessToken(t.access_token);
    setAuthenticated(true);
  }, []);

  // One refresh at a time: a second call reuses the first one's promise.
  const refreshSession = useCallback((): Promise<string | null> => {
    if (inFlight.current) return inFlight.current;
    inFlight.current = (async () => {
      const stored = await SecureStore.getItemAsync(REFRESH_KEY);
      if (!stored) return null;
      try {
        const tokens = await authApi.refresh(stored);
        await saveTokens(tokens);
        return tokens.access_token;
      } catch (e) {
        if (e instanceof ApiError) await clearSession(); // server rejected it
        return null;                                      // network error: keep it
      } finally {
        inFlight.current = null;
      }
    })();
    return inFlight.current;
  }, [saveTokens, clearSession]);

  useEffect(() => {
    setSessionHandlers({ refresh: refreshSession, onExpired: () => { clearSession(); } });
    refreshSession().finally(() => setIsLoading(false)); // restore session on app start
    return () => setSessionHandlers(null);
  }, [refreshSession, clearSession]);

  const login = useCallback(async (email: string, password: string) => {
    await saveTokens(await authApi.login({ email, password }));
  }, [saveTokens]);

  const logout = useCallback(async () => {
    const stored = await SecureStore.getItemAsync(REFRESH_KEY);
    if (stored) await authApi.logout(stored);
    await clearSession();
  }, [clearSession]);

  const value = useMemo(
    () => ({ isLoading, isAuthenticated, login, logout }),
    [isLoading, isAuthenticated, login, logout],
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