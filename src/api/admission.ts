import type { Dict } from '../store/language-context';
import { ApiError } from './client';

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
  | 'NETWORK'
  | 'UNKNOWN';

export interface ClassifiedAdmissionError {
  kind: AdmissionRejection;
  /** Transient failure: resubmitting the same request may succeed. */
  retryable: boolean;
  checkedInAt?: string;
  serverMessage?: string;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function classifyAdmissionError(error: unknown): ClassifiedAdmissionError {
  if (!(error instanceof ApiError)) {
    return { kind: 'NETWORK', retryable: true };
  }

  const details = error.details ?? {};
  const admission = str(details.admission_status);
  const ticketStatus = str(details.ticket_status) ?? str(details.status);
  const checkedInAt = str(details.checked_in_at);

  if (error.code === 'NETWORK_ERROR' || error.status === 0) {
    return { kind: 'NETWORK', retryable: true };
  }
  if (error.code === 'CAMPAIGN_QR_NOT_ADMISSION' || admission === 'CAMPAIGN_QR') {
    return { kind: 'CAMPAIGN_QR', retryable: false };
  }
  if (error.code === 'TICKET_ALREADY_CHECKED_IN' || admission === 'ALREADY_CHECKED_IN') {
    return { kind: 'ALREADY_CHECKED_IN', retryable: false, checkedInAt };
  }
  if (admission === 'CANCELLED' || (error.code === 'TICKET_NOT_VALID' && ticketStatus === 'CANCELLED')) {
    return { kind: 'CANCELLED', retryable: false };
  }
  if (admission === 'REFUNDED' || (error.code === 'TICKET_NOT_VALID' && ticketStatus === 'REFUNDED')) {
    return { kind: 'REFUNDED', retryable: false };
  }
  if (admission === 'WRONG_EVENT') {
    return { kind: 'WRONG_EVENT', retryable: false };
  }
  if (error.code === 'INVALID_TICKET_QR' || admission === 'INVALID_QR') {
    return { kind: 'INVALID_QR', retryable: false };
  }
  if (error.code === 'TICKET_NOT_FOUND' || admission === 'NOT_FOUND') {
    return { kind: 'NOT_FOUND', retryable: false };
  }
  if (error.code === 'TICKET_NOT_CHECKED_IN' || admission === 'NOT_CHECKED_IN') {
    return { kind: 'NOT_CHECKED_IN', retryable: false };
  }
  if (
    error.code === 'INSUFFICIENT_EVENT_PERMISSIONS' ||
    error.code === 'INSUFFICIENT_PERMISSIONS' ||
    error.code === 'EVENT_NOT_FOUND' ||
    error.status === 403
  ) {
    return { kind: 'FORBIDDEN', retryable: false };
  }
  // Server errors, timeouts and explicit retry hints are worth retrying.
  const retryable =
    error.status >= 500 || error.status === 408 || error.status === 429 || details.retryable === true ||
    error.code === 'TICKET_REVERSAL_CONFLICT';
  return { kind: 'UNKNOWN', retryable, serverMessage: error.message };
}

export function admissionTitle(kind: AdmissionRejection, t: Dict): string {
  switch (kind) {
    case 'ALREADY_CHECKED_IN':
      return t.alreadyCheckedIn;
    case 'INVALID_QR':
    case 'NOT_FOUND':
      return t.invalidTicketTitle;
    case 'CAMPAIGN_QR':
      return t.campaignQrTitle;
    case 'WRONG_EVENT':
      return t.wrongEventTitle;
    case 'CANCELLED':
      return t.ticketCancelledTitle;
    case 'REFUNDED':
      return t.ticketRefundedTitle;
    case 'NETWORK':
      return t.networkErrorTitle;
    default:
      return t.checkInFailed;
  }
}

export function admissionMessage(result: ClassifiedAdmissionError, t: Dict): string {
  switch (result.kind) {
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
    case 'NETWORK':
      return t.errNetwork;
    default:
      return result.serverMessage ?? t.errActionGeneric;
  }
}
