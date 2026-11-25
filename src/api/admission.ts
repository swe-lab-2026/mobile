import type { Dict } from '../store/language-context';
import { ApiError, NETWORK_ERROR, TIMEOUT_ERROR } from './client';

/**
 * Admission rejection outcomes. The backend puts these in
 * `error.details.admission_status`; cancelled and refunded tickets share the
 * legacy `TICKET_NOT_VALID` code and are only distinguishable through it.
 */
export type AdmissionRejection =
  | 'ALREADY_CHECKED_IN'
  | 'INVALID_QR'
  | 'CAMPAIGN_QR'
  | 'NOT_FOUND'
  | 'WRONG_EVENT'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'NOT_CHECKED_IN'
  | 'FORBIDDEN'
  | 'SESSION_EXPIRED'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'SERVER'
  | 'UNKNOWN';

export interface ClassifiedAdmissionError {
  kind: AdmissionRejection;
  /** Transient failure: resubmitting the same request may succeed. */
  retryable: boolean;
  /**
   * The request may have been applied by the server even though the client
   * never received the response (timeout, dropped connection, 5xx).
   */
  uncertain: boolean;
  checkedInAt?: string;
  serverMessage?: string;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

const SESSION_CODES = new Set(['TOKEN_EXPIRED', 'TOKEN_INVALID', 'REFRESH_TOKEN_REUSED']);

function result(
  kind: AdmissionRejection,
  extra: Partial<ClassifiedAdmissionError> = {},
): ClassifiedAdmissionError {
  return { kind, retryable: false, uncertain: false, ...extra };
}

export function classifyAdmissionError(error: unknown): ClassifiedAdmissionError {
  if (!(error instanceof ApiError)) {
    return result('NETWORK', { retryable: true, uncertain: true });
  }

  const details = error.details ?? {};
  const admission = str(details.admission_status);
  const ticketStatus = str(details.ticket_status) ?? str(details.status);
  const checkedInAt = str(details.checked_in_at);

  if (error.code === TIMEOUT_ERROR || error.status === 408) {
    return result('TIMEOUT', { retryable: true, uncertain: true });
  }
  if (error.code === NETWORK_ERROR || error.status === 0) {
    return result('NETWORK', { retryable: true, uncertain: true });
  }
  // Campaign QR codes are promotional links: never an admission credential.
  if (error.code === 'CAMPAIGN_QR_NOT_ADMISSION' || admission === 'CAMPAIGN_QR') {
    return result('CAMPAIGN_QR');
  }
  if (error.code === 'TICKET_ALREADY_CHECKED_IN' || admission === 'ALREADY_CHECKED_IN') {
    return result('ALREADY_CHECKED_IN', { checkedInAt });
  }
  if (admission === 'CANCELLED' || (error.code === 'TICKET_NOT_VALID' && ticketStatus === 'CANCELLED')) {
    return result('CANCELLED');
  }
  if (admission === 'REFUNDED' || (error.code === 'TICKET_NOT_VALID' && ticketStatus === 'REFUNDED')) {
    return result('REFUNDED');
  }
  if (admission === 'WRONG_EVENT') {
    return result('WRONG_EVENT');
  }
  // INVALID_TICKET_QR is a 401 from the backend; it is a ticket outcome, not a session error.
  if (error.code === 'INVALID_TICKET_QR' || admission === 'INVALID_QR') {
    return result('INVALID_QR');
  }
  if (error.code === 'TICKET_NOT_FOUND' || admission === 'NOT_FOUND') {
    return result('NOT_FOUND');
  }
  if (error.code === 'TICKET_NOT_CHECKED_IN' || admission === 'NOT_CHECKED_IN') {
    return result('NOT_CHECKED_IN');
  }
  if (error.status === 401 || (error.code && SESSION_CODES.has(error.code))) {
    return result('SESSION_EXPIRED');
  }
  if (
    error.code === 'INSUFFICIENT_EVENT_PERMISSIONS' ||
    error.code === 'INSUFFICIENT_PERMISSIONS' ||
    error.code === 'EVENT_NOT_FOUND' ||
    error.status === 403
  ) {
    return result('FORBIDDEN');
  }
  if (error.status >= 500) {
    return result('SERVER', { retryable: true, uncertain: true, serverMessage: error.message });
  }
  const retryable =
    error.status === 429 || details.retryable === true || error.code === 'TICKET_REVERSAL_CONFLICT';
  return result('UNKNOWN', { retryable, serverMessage: error.message });
}

/** Allowed difference between device and server clocks when matching timestamps. */
const CLOCK_SKEW_MS = 2 * 60 * 1000;

/**
 * After an uncertain check-in attempt, a retry that reports ALREADY_CHECKED_IN
 * with a check-in time at or after the first attempt most likely means the
 * first attempt was recorded and only its response was lost.
 */
export function likelyRecordedByEarlierAttempt(
  retry: ClassifiedAdmissionError,
  firstAttemptAt: number,
  now: number = Date.now(),
): boolean {
  if (retry.kind !== 'ALREADY_CHECKED_IN' || !retry.checkedInAt) return false;
  const checkedIn = new Date(retry.checkedInAt).getTime();
  if (Number.isNaN(checkedIn)) return false;
  return checkedIn >= firstAttemptAt - CLOCK_SKEW_MS && checkedIn <= now + CLOCK_SKEW_MS;
}

export function admissionTitle(kind: AdmissionRejection, t: Dict): string {
  switch (kind) {
    case 'ALREADY_CHECKED_IN':
      return t.alreadyCheckedIn;
    case 'INVALID_QR':
      return t.invalidTicketTitle;
    case 'NOT_FOUND':
      return t.ticketNotFoundTitle;
    case 'CAMPAIGN_QR':
      return t.campaignQrTitle;
    case 'WRONG_EVENT':
      return t.wrongEventTitle;
    case 'CANCELLED':
      return t.ticketCancelledTitle;
    case 'REFUNDED':
      return t.ticketRefundedTitle;
    case 'FORBIDDEN':
      return t.noPermissionTitle;
    case 'SESSION_EXPIRED':
      return t.sessionExpiredTitle;
    case 'NETWORK':
      return t.networkErrorTitle;
    case 'TIMEOUT':
      return t.timeoutTitle;
    case 'SERVER':
      return t.serverErrorTitle;
    default:
      return t.checkInFailed;
  }
}

export function admissionMessage(classified: ClassifiedAdmissionError, t: Dict): string {
  switch (classified.kind) {
    case 'ALREADY_CHECKED_IN':
      return t.errTicketAlreadyCheckedIn;
    case 'INVALID_QR':
      return t.errInvalidTicketQr;
    case 'CAMPAIGN_QR':
      return t.errCampaignQr;
    case 'NOT_FOUND':
      return t.errTicketNotFound;
    case 'WRONG_EVENT':
      return t.errWrongEvent;
    case 'CANCELLED':
      return t.errTicketCancelled;
    case 'REFUNDED':
      return t.errTicketRefunded;
    case 'NOT_CHECKED_IN':
      return t.errTicketNotCheckedIn;
    case 'FORBIDDEN':
      return t.errInsufficientPermissions;
    case 'SESSION_EXPIRED':
      return t.errSessionExpired;
    case 'NETWORK':
      return t.errNetwork;
    case 'TIMEOUT':
      return t.errTimeout;
    case 'SERVER':
      return t.errServer;
    default:
      return classified.serverMessage ?? t.errActionGeneric;
  }
}

/** Extra guidance shown when the outcome of a mutation is unknown. */
export function uncertainOutcomeHint(classified: ClassifiedAdmissionError, t: Dict): string | null {
  return classified.uncertain ? t.uncertainOutcomeHint : null;
}
