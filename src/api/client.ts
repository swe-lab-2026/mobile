const API_PREFIX = '/api/v1';

let accessToken: string | null = null;
let handlers: {
  refresh: () => Promise<string | null>;
  onExpired: () => void | Promise<void>;
} | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

export const setSessionHandlers = (next: typeof handlers) => {
  handlers = next;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isDefinitiveSessionError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

function normalizeBaseUrl(raw: string): string {
  const value = raw.trim();
  if (!value) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is not configured.');
  }
  if (!/^https?:\/\//i.test(value)) {
    throw new Error(
      'EXPO_PUBLIC_API_BASE_URL must be an absolute http(s) URL, for example http://10.0.2.2:8000/api/v1.',
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      'EXPO_PUBLIC_API_BASE_URL is not a valid URL. Configure an absolute backend URL including /api/v1.',
    );
  }

  const trimmedPath = url.pathname.replace(/\/+$/, '');
  const path = trimmedPath.toLowerCase().endsWith(API_PREFIX)
    ? trimmedPath
    : `${trimmedPath}${API_PREFIX}`;

  url.pathname = path;
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

let baseUrl: string | null = null;

export function getApiBaseUrl(): string {
  if (baseUrl) return baseUrl;

  const raw = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (!raw || !raw.trim()) {
    throw new Error(
      'Missing EXPO_PUBLIC_API_BASE_URL. Set it to your backend API URL including /api/v1 (for example http://10.0.2.2:8000/api/v1 on an Android emulator).',
    );
  }

  baseUrl = normalizeBaseUrl(raw);
  return baseUrl;
}

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

interface ParsedError {
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
}

async function parseError(response: Response): Promise<ParsedError | null> {
  const body = await response
    .clone()
    .json()
    .catch(() => null);
  return body?.error ?? null;
}

async function send(
  path: string,
  options: RequestOptions,
  token: string | null,
): Promise<Response> {
  const { skipAuth: _skipAuth, headers, ...rest } = options;
  const requestHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(headers as Record<string, string> | undefined),
  };

  if (rest.body !== undefined && !requestHeaders['Content-Type']) {
    requestHeaders['Content-Type'] = 'application/json';
  }
  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  try {
    return await fetch(`${getApiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`, {
      ...rest,
      headers: requestHeaders,
    });
  } catch {
    throw new ApiError(
      'Cannot reach the server. Check your connection and backend URL.',
      0,
      'NETWORK_ERROR',
    );
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { skipAuth } = options;
  let sentToken = skipAuth ? null : accessToken;
  let response = await send(path, options, sentToken);

  if (response.status === 401 && !skipAuth) {
    // Another request (or a login/logout) may have changed the token while
    // this response was in flight. Retry once with the current token before
    // refreshing or invalidating the session. If the token changed again, the
    // response is stale and must not invalidate a newer session.
    if (sentToken !== accessToken && accessToken) {
      sentToken = accessToken;
      response = await send(path, options, sentToken);
    }

    if (response.status === 401 && sentToken === accessToken) {
      const error = await parseError(response);

      if (error?.code === 'TOKEN_EXPIRED' && handlers) {
        const freshAccessToken = await handlers.refresh();
        if (freshAccessToken) {
          response = await send(path, options, freshAccessToken);
          if (response.status === 401 && freshAccessToken === accessToken) {
            await handlers.onExpired();
          }
        } else {
          await handlers.onExpired();
        }
      } else if (!error?.code || error.code === 'TOKEN_INVALID') {
        await handlers?.onExpired();
      }
    }
  }

  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      body?.error?.message ?? `Request failed (${response.status})`,
      response.status,
      body?.error?.code,
      body?.error?.details,
    );
  }

  return body as T;
}
