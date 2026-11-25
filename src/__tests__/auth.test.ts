import { ApiError, apiRequest } from '../api/client';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
    isAvailableAsync: jest.fn(async () => true),
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
    __store: store,
  };
});

jest.mock('../api/client', () => {
  const actual = jest.requireActual('../api/client');
  return { ...actual, apiRequest: jest.fn() };
});

const mockedRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const secureStore = require('expo-secure-store') as { __store: Map<string, string> };

const tokens = (n: number) => ({
  access_token: `access-${n}`,
  refresh_token: `refresh-${n}`,
  token_type: 'bearer',
  expires_in: 900,
});
const user = {
  user_id: 'u1',
  email: 'staff@example.com',
  first_name: 'S',
  last_name: 'T',
  global_role: 'USER',
  status: 'ACTIVE',
  email_verified_at: '2026-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
};

async function loadAuth() {
  let auth: typeof import('../api/auth') | undefined;
  jest.isolateModules(() => {
    auth = jest.requireActual('../api/auth');
  });
  return auth!;
}

beforeEach(() => {
  mockedRequest.mockReset();
  secureStore.__store.clear();
});

describe('session refresh', () => {
  it('coalesces concurrent refreshes into a single /auth/refresh call', async () => {
    const auth = await loadAuth();
    mockedRequest.mockImplementation(async (path: string) => {
      if (path === '/auth/login') return tokens(1);
      if (path === '/users/me') return user;
      if (path === '/auth/refresh') return tokens(2);
      throw new Error(`unexpected ${path}`);
    });
    await auth.login({ email: 'staff@example.com', password: 'pw' });

    const [a, b, c] = await Promise.all([
      auth.refreshAccessToken(),
      auth.refreshAccessToken(),
      auth.refreshAccessToken(),
    ]);
    expect([a, b, c]).toEqual(['access-2', 'access-2', 'access-2']);
    expect(mockedRequest.mock.calls.filter(([p]) => p === '/auth/refresh')).toHaveLength(1);
    expect(secureStore.__store.get('biletflow.auth.refresh_token')).toBe('refresh-2');
  });

  it('invalidates the session when the refresh token is rejected', async () => {
    const auth = await loadAuth();
    const invalidated = jest.fn();
    auth.setSessionInvalidatedHandler(invalidated);
    mockedRequest.mockImplementation(async (path: string) => {
      if (path === '/auth/login') return tokens(1);
      if (path === '/users/me') return user;
      throw new ApiError('reused', 401, 'REFRESH_TOKEN_REUSED');
    });
    await auth.login({ email: 'staff@example.com', password: 'pw' });

    await expect(auth.refreshAccessToken()).rejects.toMatchObject({ code: 'REFRESH_TOKEN_REUSED' });
    expect(invalidated).toHaveBeenCalled();
    expect(secureStore.__store.has('biletflow.auth.refresh_token')).toBe(false);
  });

  it('keeps the stored session when the refresh fails offline', async () => {
    const auth = await loadAuth();
    const invalidated = jest.fn();
    auth.setSessionInvalidatedHandler(invalidated);
    mockedRequest.mockImplementation(async (path: string) => {
      if (path === '/auth/login') return tokens(1);
      if (path === '/users/me') return user;
      throw new ApiError('offline', 0, 'NETWORK_ERROR');
    });
    await auth.login({ email: 'staff@example.com', password: 'pw' });

    await expect(auth.refreshAccessToken()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(invalidated).not.toHaveBeenCalled();
    expect(secureStore.__store.get('biletflow.auth.refresh_token')).toBe('refresh-1');
  });

  it('logout clears the stored token even when the server is unreachable', async () => {
    const auth = await loadAuth();
    mockedRequest.mockImplementation(async (path: string) => {
      if (path === '/auth/login') return tokens(1);
      if (path === '/users/me') return user;
      throw new ApiError('offline', 0, 'NETWORK_ERROR');
    });
    await auth.login({ email: 'staff@example.com', password: 'pw' });
    await expect(auth.logout()).resolves.toBeUndefined();
    expect(secureStore.__store.has('biletflow.auth.refresh_token')).toBe(false);
  });

  it('restores a stored session, and returns null when none exists', async () => {
    const auth = await loadAuth();
    await expect(auth.restoreSession()).resolves.toBeNull();

    secureStore.__store.set('biletflow.auth.refresh_token', 'refresh-9');
    mockedRequest.mockImplementation(async (path: string) => {
      if (path === '/auth/refresh') return tokens(10);
      if (path === '/users/me') return user;
      throw new Error(path);
    });
    await expect(auth.restoreSession()).resolves.toMatchObject({ userId: 'u1' });
  });
});
