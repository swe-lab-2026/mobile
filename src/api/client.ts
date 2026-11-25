const API_PREFIX = '/api/v1';
const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|10\.0\.2\.2|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;

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

/** Thrown when EXPO_PUBLIC_API_BASE_URL is missing or unusable for this build. */
export class ApiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiConfigError';
  }
}

export function isDefinitiveSessionError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

function normalizeBaseUrl(raw: string): string {
  const value = raw.trim();
  if (!value) {
    throw new ApiConfigError(
      'EXPO_PUBLIC_API_BASE_URL is not configured. Set it in .env (development) or the build environment (demo/release).',
    );
  }
  if (!/^https?:\/\//i.test(value)) {
    throw new ApiConfigError(
      'EXPO_PUBLIC_API_BASE_URL must be an absolute http(s) URL, for example https://api.example.com/api/v1.',
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiConfigError(
      'EXPO_PUBLIC_API_BASE_URL is not a valid URL. Configure an absolute backend URL including /api/v1.',
    );
  }

  // Release (demo) builds must talk to a deployed HTTPS API. Plain HTTP is
  // accepted only in development builds and only for local/LAN hosts.
  if (url.protocol === 'http:') {
    if (!__DEV__) {
      throw new ApiConfigError(
        `EXPO_PUBLIC_API_BASE_URL must use HTTPS in release builds (got ${url.origin}).`,
      );
    }
    if (!LOCAL_HOSTS.test(url.hostname)) {
      throw new ApiConfigError(
        `Plain HTTP is only allowed for local development hosts (got ${url.hostname}). Use HTTPS for deployed APIs.`,
      );
    }
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

  baseUrl = normalizeBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL ?? '');
  return baseUrl;
}

/** Returns a human-readable configuration problem, or null when the API URL is usable. */
export function getApiConfigError(): string | null {
  try {
    getApiBaseUrl();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
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

  // Resolve outside the try so configuration errors are not reported as network errors.
  const url = `${getApiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  try {
    return await fetch(url, {
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