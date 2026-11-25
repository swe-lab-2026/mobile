const API_PREFIX = '/api/v1';
const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|10\.0\.2\.2|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;

/** Default per-request timeout. A check-in normally completes well under 2 s. */
export const DEFAULT_TIMEOUT_MS = 15000;

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

export const NETWORK_ERROR = 'NETWORK_ERROR';
export const TIMEOUT_ERROR = 'REQUEST_TIMEOUT';

export type ApiErrorKind =
  | 'config'
  | 'timeout'
  | 'network'
  | 'auth'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'rate_limited'
  | 'server'
  | 'unknown';

/** Coarse error category used for user-facing messages and retry decisions. */
export function classifyApiError(error: unknown): ApiErrorKind {
  if (error instanceof ApiConfigError) return 'config';
  if (!(error instanceof ApiError)) return 'unknown';
  if (error.code === TIMEOUT_ERROR) return 'timeout';
  if (error.code === NETWORK_ERROR || error.status === 0) return 'network';
  if (error.status === 401) return 'auth';
  if (error.status === 403) return 'forbidden';
  if (error.status === 404) return 'not_found';
  if (error.status === 400 || error.status === 422) return 'validation';
  if (error.status === 409) return 'conflict';
  if (error.status === 429) return 'rate_limited';
  if (error.status === 408) return 'timeout';
  if (error.status >= 500) return 'server';
  return 'unknown';
}

/**
 * True when a request may have reached the server but the client never saw
 * the outcome. A mutating request in this state must not be blindly retried.
 */
export function isUncertainOutcome(error: unknown): boolean {
  const kind = classifyApiError(error);
  return kind === 'timeout' || kind === 'network' || kind === 'server';
}

export function isDefinitiveSessionError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

/**
 * Validates and normalizes the configured API base URL. Exported for tests;
 * `isDev` mirrors `__DEV__` so release rules can be verified.
 */
export function normalizeBaseUrl(raw: string, isDev: boolean): string {
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
    if (!isDev) {
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

  return `${url.origin}${path}`;
}

let baseUrl: string | null = null;

export function getApiBaseUrl(): string {
  if (baseUrl) return baseUrl;

  baseUrl = normalizeBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL ?? '', __DEV__);
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

export interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
  /** Abort the request after this many milliseconds (default DEFAULT_TIMEOUT_MS). */
  timeoutMs?: number;
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

/**
 * fetch with a hard timeout. A caller-provided AbortSignal is honoured too:
 * aborting it surfaces as an ABORTED error rather than a network error.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const external = init.signal;
  const onExternalAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', onExternalAbort);
  }

  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch {
    if (timedOut) {
      throw new ApiError('The server took too long to respond.', 0, TIMEOUT_ERROR);
    }
    if (external?.aborted) {
      throw new ApiError('The request was cancelled.', 0, 'ABORTED');
    }
    throw new ApiError(
      'Cannot reach the server. Check your connection and backend URL.',
      0,
      NETWORK_ERROR,
    );
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', onExternalAbort);
  }
}

async function send(
  path: string,
  options: RequestOptions,
  token: string | null,
): Promise<Response> {
  const { skipAuth: _skipAuth, timeoutMs, headers, ...rest } = options;
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

  // Resolve outside the fetch so configuration errors are not reported as network errors.
  const url = `${getApiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  return fetchWithTimeout(
    url,
    { ...rest, headers: requestHeaders },
    timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
}

/**
 * Authenticated JSON request.
 *
 * Retry policy: a request is re-sent only after a 401 that the backend raised
 * while authenticating it (the operation was never executed), so mutating
 * requests are never duplicated. Timeouts and network errors are never
 * retried here; callers decide how to recover from an uncertain outcome.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { skipAuth } = options;
  let sentToken = skipAuth ? null : accessToken;
  let response = await send(path, options, sentToken);

  if (response.status === 401 && !skipAuth) {
    const firstError = await parseError(response);
    const authFailure =
      !firstError?.code || firstError.code === 'TOKEN_EXPIRED' || firstError.code === 'TOKEN_INVALID';

    // Another request (or a login/logout) may have changed the token while
    // this response was in flight. Retry once with the current token before
    // refreshing or invalidating the session. If the token changed again, the
    // response is stale and must not invalidate a newer session.
    if (authFailure && sentToken !== accessToken && accessToken) {
      sentToken = accessToken;
      response = await send(path, options, sentToken);
    }

    if (authFailure && response.status === 401 && sentToken === accessToken) {
      const error = await parseError(response);

      if (error?.code === 'TOKEN_EXPIRED' && handlers) {
        // A refresh that fails for a transient reason (network, timeout)
        // propagates its error; only a definitive rejection ends the session
        // (performRefresh invalidates it), so a flaky connection never logs out.
        const freshAccessToken = await handlers.refresh();
        if (freshAccessToken) {
          response = await send(path, options, freshAccessToken);
          if (response.status === 401 && freshAccessToken === accessToken) {
            const retried = await parseError(response);
            if (!retried?.code || retried.code === 'TOKEN_EXPIRED' || retried.code === 'TOKEN_INVALID') {
              await handlers.onExpired();
            }
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
