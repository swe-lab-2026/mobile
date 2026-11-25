import {
  admissionMessage,
  admissionTitle,
  classifyAdmissionError,
  likelyRecordedByEarlierAttempt,
} from '../api/admission';
import { ApiError } from '../api/client';
import { DICTS } from '../store/language-context';

const en = DICTS.en;

function apiError(status: number, code: string, details?: Record<string, unknown>) {
  return new ApiError(code, status, code, details);
}

describe('classifyAdmissionError', () => {
  it('distinguishes cancelled from refunded tickets sharing TICKET_NOT_VALID', () => {
    const cancelled = classifyAdmissionError(
      apiError(409, 'TICKET_NOT_VALID', { admission_status: 'CANCELLED', ticket_status: 'CANCELLED' }),
    );
    const refunded = classifyAdmissionError(
      apiError(409, 'TICKET_NOT_VALID', { admission_status: 'REFUNDED', ticket_status: 'REFUNDED' }),
    );
    expect(cancelled.kind).toBe('CANCELLED');
    expect(refunded.kind).toBe('REFUNDED');
    expect(admissionMessage(cancelled, en)).not.toBe(admissionMessage(refunded, en));
    expect(admissionTitle('CANCELLED', en)).not.toBe(admissionTitle('REFUNDED', en));
  });

  it('falls back to ticket_status when admission_status is missing (older backend)', () => {
    expect(classifyAdmissionError(apiError(409, 'TICKET_NOT_VALID', { ticket_status: 'REFUNDED' })).kind).toBe(
      'REFUNDED',
    );
  });

  it('rejects campaign QR codes as non-admission credentials', () => {
    const result = classifyAdmissionError(
      apiError(400, 'CAMPAIGN_QR_NOT_ADMISSION', { admission_status: 'CAMPAIGN_QR' }),
    );
    expect(result).toMatchObject({ kind: 'CAMPAIGN_QR', retryable: false });
  });

  it('reports duplicates with the original check-in time', () => {
    const result = classifyAdmissionError(
      apiError(409, 'TICKET_ALREADY_CHECKED_IN', {
        admission_status: 'ALREADY_CHECKED_IN',
        checked_in_at: '2026-11-25T10:00:00+00:00',
      }),
    );
    expect(result).toMatchObject({ kind: 'ALREADY_CHECKED_IN', checkedInAt: '2026-11-25T10:00:00+00:00' });
  });

  it('maps wrong-event tickets before the generic not-found code', () => {
    expect(classifyAdmissionError(apiError(404, 'TICKET_NOT_FOUND', { admission_status: 'WRONG_EVENT' })).kind).toBe(
      'WRONG_EVENT',
    );
    expect(classifyAdmissionError(apiError(404, 'TICKET_NOT_FOUND', { admission_status: 'NOT_FOUND' })).kind).toBe(
      'NOT_FOUND',
    );
  });

  it('treats the 401 INVALID_TICKET_QR as a ticket outcome, not a session error', () => {
    expect(classifyAdmissionError(apiError(401, 'INVALID_TICKET_QR', { admission_status: 'INVALID_QR' })).kind).toBe(
      'INVALID_QR',
    );
    expect(classifyAdmissionError(apiError(401, 'TOKEN_INVALID')).kind).toBe('SESSION_EXPIRED');
  });

  it('maps permission errors', () => {
    expect(classifyAdmissionError(apiError(403, 'INSUFFICIENT_EVENT_PERMISSIONS')).kind).toBe('FORBIDDEN');
  });

  it('marks network, timeout and server failures as retryable with an uncertain outcome', () => {
    for (const [error, kind] of [
      [new ApiError('x', 0, 'NETWORK_ERROR'), 'NETWORK'],
      [new ApiError('x', 0, 'REQUEST_TIMEOUT'), 'TIMEOUT'],
      [apiError(503, 'INTERNAL_ERROR'), 'SERVER'],
    ] as const) {
      expect(classifyAdmissionError(error)).toMatchObject({ kind, retryable: true, uncertain: true });
    }
  });

  it('does not retry definitive rejections', () => {
    expect(classifyAdmissionError(apiError(409, 'TICKET_NOT_CHECKED_IN')).retryable).toBe(false);
  });
});

describe('likelyRecordedByEarlierAttempt', () => {
  const firstAttempt = Date.parse('2026-11-25T10:00:00Z');
  const duplicate = (at: string) =>
    classifyAdmissionError(
      apiError(409, 'TICKET_ALREADY_CHECKED_IN', { admission_status: 'ALREADY_CHECKED_IN', checked_in_at: at }),
    );

  it('recognises a check-in recorded by the lost first attempt', () => {
    expect(likelyRecordedByEarlierAttempt(duplicate('2026-11-25T10:00:01Z'), firstAttempt, firstAttempt + 5000)).toBe(
      true,
    );
  });

  it('does not claim an older, unrelated check-in', () => {
    expect(likelyRecordedByEarlierAttempt(duplicate('2026-11-25T08:00:00Z'), firstAttempt, firstAttempt + 5000)).toBe(
      false,
    );
  });

  it('ignores other outcomes', () => {
    expect(likelyRecordedByEarlierAttempt(classifyAdmissionError(apiError(409, 'TICKET_NOT_VALID')), firstAttempt)).toBe(
      false,
    );
  });
});
