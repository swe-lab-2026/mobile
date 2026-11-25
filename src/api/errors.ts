import type { Dict } from '../store/language-context';
import { ApiError, classifyApiError } from './client';

/**
 * Backend codes with a dedicated translated message. Anything else falls back
 * to a category message, and finally to the server's own text for 4xx
 * business errors (which are already human-readable).
 */
function codeMessage(code: string | undefined, t: Dict): string | null {
  switch (code) {
    case 'INVALID_CREDENTIALS':
      return t.errCredentials;
    case 'EMAIL_NOT_VERIFIED':
      return t.errNotVerified;
    case 'EMAIL_ALREADY_EXISTS':
      return t.errExists;
    case 'USER_BLOCKED':
      return t.errUserBlocked;
    case 'TOO_MANY_ATTEMPTS':
      return t.errRateLimited;
    case 'INVALID_VERIFICATION_CODE':
    case 'INVALID_RESET_TOKEN':
      return t.errInvalidCode;
    case 'VERIFICATION_CODE_EXPIRED':
    case 'RESET_TOKEN_EXPIRED':
      return t.errCodeExpired;
    case 'INSUFFICIENT_EVENT_PERMISSIONS':
    case 'INSUFFICIENT_PERMISSIONS':
      return t.errInsufficientPermissions;
    case 'EVENT_NOT_FOUND':
      return t.eventNotFound;
    default:
      return null;
  }
}

/** Localized, user-facing description of any error thrown by the API layer. */
export function describeError(error: unknown, t: Dict): string {
  const byCode = error instanceof ApiError ? codeMessage(error.code, t) : null;
  if (byCode) return byCode;

  switch (classifyApiError(error)) {
    case 'config':
      return t.errConfig;
    case 'timeout':
      return t.errTimeout;
    case 'network':
      return t.errNetwork;
    case 'auth':
      return t.errSessionExpired;
    case 'forbidden':
      return t.errInsufficientPermissions;
    case 'rate_limited':
      return t.errRateLimited;
    case 'server':
      return t.errServer;
    case 'not_found':
    case 'validation':
    case 'conflict':
      // Business-rule rejections carry a specific explanation from the backend.
      return error instanceof ApiError && error.message ? error.message : t.errGeneric;
    default:
      return t.errGeneric;
  }
}
