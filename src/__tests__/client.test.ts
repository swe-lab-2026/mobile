import {
  ApiConfigError,
  ApiError,
  apiRequest,
  classifyApiError,
  fetchWithTimeout,
  isUncertainOutcome,
  normalizeBaseUrl,
  setAccessToken,
  setSessionHandlers,
} from '../api/client';
import { describeError } from '../api/errors';
import { DICTS } from '../store/language-context';

describe('normalizeBaseUrl', () => {
  it('appends /api/v1 once', () => {
    expect(normalizeBaseUrl('https://api.example.com', false)).toBe('https://api.example.com/api/v1');
    expect(normalizeBaseUrl('https://api.example.com/api/v1', false)).toBe('https://api.example.com/api/v1');
    expect(normalizeBaseUrl('https://api.example.com/api/v1/', false)).toBe('https://api.example.com/api/v1');
    expect(normalizeBaseUrl('  https://api.example.com/base/  ', false)).toBe('https://api.example.com/base/api/v1');
  });

  it('drops query strings and fragments', () => {
    expect(normalizeBaseUrl('https://api.example.com/api/v1?x=1#y', false)).toBe('https://api.example.com/api/v1');
  });

  it('requires HTTPS in release builds', () => {
    expect(() => normalizeBaseUrl('http://192.168.1.50:8000/api/v1', false)).toThrow(ApiConfigError);
  });

  it('allows plain HTTP only for local hosts in development', () => {
    expect(normalizeBaseUrl('http://10.0.2.2:8000', true)).toBe('http://10.0.2.2:8000/api/v1');
    expect(normalizeBaseUrl('http://192.168.1.50:8000/api/v1', true)).toBe('http://192.168.1.50:8000/api/v1');
    expect(() => normalizeBaseUrl('http://api.example.com', true)).toThrow(ApiConfigError);
  });

  it('rejects missing or relative URLs with a configuration error', () => {
    expect(() => normalizeBaseUrl('', true)).toThrow(ApiConfigError);
    expect(() => normalizeBaseUrl('/api/v1', true)).toThrow(ApiConfigError);
  });
});

describe('fetchWithTimeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const hangingFetch = ((_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    })) as typeof fetch;

  it('aborts a hanging request and reports a timeout', async () => {
    const pending = fetchWithTimeout('https://x/api/v1/a', {}, 1000, hangingFetch);
    jest.advanceTimersByTime(1000);
    await expect(pending).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' });
  });

  it('reports a network error when fetch fails', async () => {
    const failing = (() => Promise.reject(new TypeError('Network request failed'))) as typeof fetch;
    await expect(fetchWithTimeout('https://x/a', {}, 1000, failing)).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('distinguishes a caller abort from a network error', async () => {
    const controller = new AbortController();
    const pending = fetchWithTimeout('https://x/a', { signal: controller.signal }, 10000, hangingFetch);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
  });
});

describe('classifyApiError', () => {
  it('categorises errors', () => {
    expect(classifyApiError(new ApiError('', 0, 'REQUEST_TIMEOUT'))).toBe('timeout');
    expect(classifyApiError(new ApiError('', 0, 'NETWORK_ERROR'))).toBe('network');
    expect(classifyApiError(new ApiError('', 401, 'TOKEN_INVALID'))).toBe('auth');
    expect(classifyApiError(new ApiError('', 403, 'INSUFFICIENT_EVENT_PERMISSIONS'))).toBe('forbidden');
    expect(classifyApiError(new ApiError('', 422, 'VALIDATION_ERROR'))).toBe('validation');
    expect(classifyApiError(new ApiError('', 500))).toBe('server');
    expect(classifyApiError(new ApiConfigError('x'))).toBe('config');
  });

  it('flags only outcomes the server may have applied as uncertain', () => {
    expect(isUncertainOutcome(new ApiError('', 0, 'REQUEST_TIMEOUT'))).toBe(true);
    expect(isUncertainOutcome(new ApiError('', 502))).toBe(true);
    expect(isUncertainOutcome(new ApiError('', 409, 'TICKET_ALREADY_CHECKED_IN'))).toBe(false);
  });

  it('produces localized messages', () => {
    expect(describeError(new ApiError('', 0, 'REQUEST_TIMEOUT'), DICTS.ru)).toBe(DICTS.ru.errTimeout);
    expect(describeError(new ApiError('', 401, 'INVALID_CREDENTIALS'), DICTS.kk)).toBe(DICTS.kk.errCredentials);
    expect(describeError(new ApiError('Ticket type is sold out', 409, 'SOLD_OUT'), DICTS.en)).toBe(
      'Ticket type is sold out',
    );
  });
});

describe('apiRequest session handling', () => {
  const realFetch = globalThis.fetch;
  const json = (status: number, body: unknown) =>
    ({
      status,
      ok: status >= 200 && status < 300,
      json: async () => body,
      clone() {
        return this;
      },
    }) as unknown as Response;
  const errorBody = (code: string) => ({ error: { code, message: code } });

  let onExpired: jest.Mock;
  let refresh: jest.Mock;

  beforeAll(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.com/api/v1';
  });
  beforeEach(() => {
    onExpired = jest.fn();
    refresh = jest.fn();
    setSessionHandlers({ refresh, onExpired });
    setAccessToken('old');
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    setSessionHandlers(null);
    setAccessToken(null);
  });

  it('does not end the session on the 401 INVALID_TICKET_QR check-in rejection', async () => {
    globalThis.fetch = jest.fn(async () => json(401, errorBody('INVALID_TICKET_QR'))) as unknown as typeof fetch;
    await expect(apiRequest('/events/e/check-in', { method: 'POST', body: '{}' })).rejects.toMatchObject({
      code: 'INVALID_TICKET_QR',
    });
    expect(onExpired).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('refreshes an expired token once and replays the request', async () => {
    refresh.mockImplementation(async () => {
      setAccessToken('new');
      return 'new';
    });
    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce(json(401, errorBody('TOKEN_EXPIRED')))
      .mockResolvedValueOnce(json(200, { ok: true })) as unknown as typeof fetch;

    await expect(apiRequest('/users/me')).resolves.toEqual({ ok: true });
    expect(refresh).toHaveBeenCalledTimes(1);
    const [, init] = (globalThis.fetch as jest.Mock).mock.calls[1];
    expect(init.headers.Authorization).toBe('Bearer new');
  });

  it('keeps the session when the refresh fails because of the network', async () => {
    refresh.mockRejectedValue(new ApiError('offline', 0, 'NETWORK_ERROR'));
    globalThis.fetch = jest.fn(async () => json(401, errorBody('TOKEN_EXPIRED'))) as unknown as typeof fetch;
    await expect(apiRequest('/users/me')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('ends the session for an invalid token', async () => {
    globalThis.fetch = jest.fn(async () => json(401, errorBody('TOKEN_INVALID'))) as unknown as typeof fetch;
    await expect(apiRequest('/users/me')).rejects.toBeInstanceOf(ApiError);
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('never re-sends a mutating request after a server error', async () => {
    globalThis.fetch = jest.fn(async () => json(500, errorBody('INTERNAL_ERROR'))) as unknown as typeof fetch;
    await expect(apiRequest('/events/e/check-in', { method: 'POST', body: '{}' })).rejects.toMatchObject({
      status: 500,
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
