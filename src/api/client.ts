const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

let accessToken: string | null = null;
let handlers: { refresh: () => Promise<string | null>; onExpired: () => void } | null = null;

export const setAccessToken = (t: string | null) => { accessToken = t; };
export const setSessionHandlers = (h: typeof handlers) => { handlers = h; };

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}

interface RequestOptions extends RequestInit { skipAuth?: boolean }

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { skipAuth, headers, ...rest } = options;
  const send = (token: string | null) =>
    fetch(`${BASE_URL}${path}`, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(headers as Record<string, string> | undefined),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

  let response = await send(skipAuth ? null : accessToken);

  if (response.status === 401 && !skipAuth) {
    const err = await response.clone().json().catch(() => null);
    if (err?.error?.code === 'TOKEN_EXPIRED' && handlers) {
      const fresh = await handlers.refresh(); // clears the session itself if the server rejects it
      if (fresh) response = await send(fresh);
    } else {
      handlers?.onExpired();
    }
  }

  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(body?.error?.message ?? `Request failed (${response.status})`,
      response.status, body?.error?.code);
  }
  return body as T;
}