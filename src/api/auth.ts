import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  ApiError,
  apiRequest,
  isDefinitiveSessionError,
  setAccessToken,
} from './client';
import {
  AuthTokens,
  AuthUser,
  LoginCredentials,
  TokenResponseDto,
  UserResponseDto,
} from '../types/auth';

const REFRESH_TOKEN_KEY = 'biletflow.auth.refresh_token';

let refreshToken: string | null = null;
let sessionEpoch = 0;
let refreshPromise: Promise<string> | null = null;
let sessionInvalidatedHandler: (() => void) | null = null;

export function setSessionInvalidatedHandler(handler: (() => void) | null) {
  sessionInvalidatedHandler = handler;
}

interface WebStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getWebStorage(): WebStorageLike | null {
  if (Platform.OS !== 'web' || typeof globalThis === 'undefined') {
    return null;
  }
  try {
    return (globalThis as { sessionStorage?: WebStorageLike }).sessionStorage ?? null;
  } catch {
    return null;
  }
}

async function readStoredRefreshToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return getWebStorage()?.getItem(REFRESH_TOKEN_KEY) ?? null;
  }

  try {
    if (!(await SecureStore.isAvailableAsync())) return null;
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

let storageQueue: Promise<void> = Promise.resolve();

function enqueueStorage(operation: () => Promise<void>): Promise<void> {
  const next = storageQueue.then(operation, operation);
  storageQueue = next.catch(() => undefined);
  return next;
}

async function writeStoredRefreshTokenNow(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    // SecureStore has no web implementation. sessionStorage is a deliberate,
    // session-scoped fallback: it is cleared when the browser tab closes and
    // is never written to persistent localStorage.
    getWebStorage()?.setItem(REFRESH_TOKEN_KEY, token);
    return;
  }

  try {
    if (!(await SecureStore.isAvailableAsync())) return;
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch {
    // Keep the in-memory session usable if the device keystore is unavailable.
  }
}

async function deleteStoredRefreshTokenNow(): Promise<void> {
  if (Platform.OS === 'web') {
    getWebStorage()?.removeItem(REFRESH_TOKEN_KEY);
    return;
  }

  try {
    if (!(await SecureStore.isAvailableAsync())) return;
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    // Nothing else to clear locally.
  }
}

function writeStoredRefreshToken(token: string, epoch: number): Promise<void> {
  return enqueueStorage(async () => {
    // A logout or a newer login may have happened while the refresh request
    // was in flight. Never let an old response overwrite the current session.
    if (epoch !== sessionEpoch || refreshToken !== token) return;
    await writeStoredRefreshTokenNow(token);
  });
}

function deleteStoredRefreshToken(): Promise<void> {
  return enqueueStorage(deleteStoredRefreshTokenNow);
}

function toTokens(dto: TokenResponseDto): AuthTokens {
  return {
    accessToken: dto.access_token,
    refreshToken: dto.refresh_token,
    tokenType: dto.token_type,
    expiresIn: dto.expires_in,
  };
}

function toUser(dto: UserResponseDto): AuthUser {
  return {
    userId: dto.user_id,
    email: dto.email,
    firstName: dto.first_name,
    lastName: dto.last_name,
    globalRole: dto.global_role,
    status: dto.status,
    emailVerifiedAt: dto.email_verified_at,
    createdAt: dto.created_at,
  };
}

function invalidateSession(): void {
  sessionEpoch += 1;
  refreshToken = null;
  setAccessToken(null);
  void deleteStoredRefreshToken();
  sessionInvalidatedHandler?.();
}

export function clearLocalSession(): void {
  invalidateSession();
}

export async function getCurrentUser(): Promise<AuthUser> {
  const dto = await apiRequest<UserResponseDto>('/users/me');
  return toUser(dto);
}

async function performRefresh(): Promise<string> {
  const token = refreshToken;
  if (!token) {
    invalidateSession();
    throw new ApiError('Your session has expired. Please sign in again.', 401, 'TOKEN_INVALID');
  }

  const epoch = sessionEpoch;

  try {
    const dto = await apiRequest<TokenResponseDto>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: token }),
      skipAuth: true,
    });
    const tokens = toTokens(dto);

    if (epoch !== sessionEpoch) {
      throw new ApiError('The session changed while it was refreshing.', 409, 'SESSION_CHANGED');
    }

    refreshToken = tokens.refreshToken;
    setAccessToken(tokens.accessToken);
    await writeStoredRefreshToken(tokens.refreshToken, epoch);
    return tokens.accessToken;
  } catch (error) {
    if (isDefinitiveSessionError(error) && epoch === sessionEpoch) {
      invalidateSession();
    }
    throw error;
  }
}

// All callers share one in-flight refresh. The backend rotates refresh tokens
// and revokes the whole family on reuse, so parallel refreshes must never race.
export function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function login(credentials: LoginCredentials): Promise<AuthUser> {
  sessionEpoch += 1;
  const epoch = sessionEpoch;
  refreshToken = null;
  setAccessToken(null);
  await deleteStoredRefreshToken();

  const dto = await apiRequest<TokenResponseDto>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: credentials.email,
      password: credentials.password,
    }),
    skipAuth: true,
  });
  const tokens = toTokens(dto);

  if (epoch !== sessionEpoch) {
    throw new ApiError('The login attempt was superseded.', 409, 'SESSION_CHANGED');
  }

  refreshToken = tokens.refreshToken;
  setAccessToken(tokens.accessToken);
  await writeStoredRefreshToken(tokens.refreshToken, epoch);

  try {
    const user = await getCurrentUser();
    if (epoch !== sessionEpoch) {
      throw new ApiError('The login attempt was superseded.', 409, 'SESSION_CHANGED');
    }
    return user;
  } catch (error) {
    if (epoch === sessionEpoch) {
      const createdRefreshToken = refreshToken;
      invalidateSession();
      if (createdRefreshToken) {
        void apiRequest('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refresh_token: createdRefreshToken }),
          skipAuth: true,
        }).catch(() => undefined);
      }
    }
    throw error;
  }
}

let restorePromise: Promise<AuthUser | null> | null = null;

async function performRestore(): Promise<AuthUser | null> {
  sessionEpoch += 1;
  const epoch = sessionEpoch;
  const stored = await readStoredRefreshToken();

  if (epoch !== sessionEpoch || !stored) {
    return null;
  }

  refreshToken = stored;

  try {
    await refreshAccessToken();
    if (epoch !== sessionEpoch) return null;

    const user = await getCurrentUser();
    if (epoch !== sessionEpoch) return null;
    return user;
  } catch (error) {
    if (isDefinitiveSessionError(error)) {
      if (epoch === sessionEpoch) {
        invalidateSession();
      }
      return null;
    }
    throw error;
  }
}

export function restoreSession(): Promise<AuthUser | null> {
  if (!restorePromise) {
    restorePromise = performRestore().finally(() => {
      restorePromise = null;
    });
  }
  return restorePromise;
}

export async function logout(): Promise<void> {
  const token = refreshToken ?? (await readStoredRefreshToken().catch(() => null));

  sessionEpoch += 1;
  refreshToken = null;
  setAccessToken(null);
  await deleteStoredRefreshToken();

  if (!token) return;

  try {
    await apiRequest('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: token }),
      skipAuth: true,
    });
  } catch {
    // Local logout must succeed even when the backend is unreachable.
  }
}
