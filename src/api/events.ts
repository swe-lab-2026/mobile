import { apiRequest } from './client';
import {
  AssignedEvent,
  AttendanceStats,
  CheckedInTicket,
  EventDetails,
  EventTicket,
} from '../types/event';

interface AssignedEventDto {
  event_id: string;
  title: string;
  status: string;
  visibility: string;
  starts_at: string;
  ends_at: string;
  venue_name: string | null;
  city: string | null;
  timezone: string;
}

interface TicketDto {
  ticket_id: string;
  public_id: string;
  order_number: number;
  ticket_type_name: string;
  attendee_name: string | null;
  attendee_email: string;
  status: string;
  checked_in_at: string | null;
}

interface TicketSearchResultDto {
  ticket_id: string;
  public_id: string;
  event_id: string;
  order_number: number;
  attendee_name: string | null;
  attendee_email: string;
  ticket_type_name: string;
  status: string;
  issued_at: string;
  checked_in_at: string | null;
  cancelled_at: string | null;
}

interface AttendanceStatsDto {
  event_id: string;
  total_registered: number;
  total_checked_in: number;
  remaining: number;
  cancelled: number;
  refunded: number;
  total_issued: number;
}

const PAGE_SIZE = 100;

function toAssignedEvent(dto: AssignedEventDto): AssignedEvent {
  return {
    id: dto.event_id,
    name: dto.title,
    startsAt: dto.starts_at,
    endsAt: dto.ends_at,
    location: [dto.venue_name, dto.city].filter(Boolean).join(', ') || undefined,
    status: dto.status,
    timezone: dto.timezone,
  };
}

function toCheckedInTicket(dto: TicketDto): CheckedInTicket {
  return {
    ticketId: dto.ticket_id,
    publicId: dto.public_id,
    attendeeName: dto.attendee_name,
    attendeeEmail: dto.attendee_email,
    ticketType: dto.ticket_type_name,
    status: dto.status,
    checkedInAt: dto.checked_in_at,
    orderNumber: dto.order_number,
  };
}

function toEventTicket(dto: TicketSearchResultDto): EventTicket {
  return {
    ticketId: dto.ticket_id,
    publicId: dto.public_id,
    eventId: dto.event_id,
    orderNumber: dto.order_number,
    attendeeName: dto.attendee_name,
    attendeeEmail: dto.attendee_email,
    ticketType: dto.ticket_type_name,
    status: dto.status,
    issuedAt: dto.issued_at,
    checkedInAt: dto.checked_in_at,
    cancelledAt: dto.cancelled_at,
  };
}

export async function getAssignedEvents(): Promise<AssignedEvent[]> {
  const all: AssignedEvent[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await apiRequest<AssignedEventDto[]>(
      `/events/assigned?limit=${PAGE_SIZE}&offset=${offset}`,
    );
    all.push(...page.map(toAssignedEvent));
    if (page.length < PAGE_SIZE) break;
  }

  return all;
}

export async function getEventDetails(eventId: string): Promise<EventDetails | null> {
  const events = await getAssignedEvents();
  return events.find((event) => event.id === eventId) ?? null;
}

export async function getEventAttendanceStats(eventId: string): Promise<AttendanceStats> {
  const dto = await apiRequest<AttendanceStatsDto>(
    `/events/${encodeURIComponent(eventId)}/tickets/stats`,
  );
  return {
    totalRegistered: dto.total_registered,
    totalCheckedIn: dto.total_checked_in,
    remaining: dto.remaining,
    cancelled: dto.cancelled,
    refunded: dto.refunded,
    totalIssued: dto.total_issued,
  };
// ---------- participants (GET /events/{id}/attendees) ----------

// The attendees response shape is not confirmed. This DTO follows the check-in
// ticket response, and the mapper below also accepts a few alternative names.
interface AttendeeDto {
  ticket_id?: string;
  id?: string;
  public_id?: string;
  order_number?: number;
  ticket_type_name?: string;
  attendee_name?: string | null;
  attendee_email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  status?: string;
  ticket_status?: string;
  checked_in_at?: string | null;
}

// Accepts a plain array, { items: [...] }, { data: [...] } or { data: { items: [...] } }.
function toArray(body: any): AttendeeDto[] {
  if (Array.isArray(body)) return body;
  const inner = body?.data ?? body;
  if (Array.isArray(inner)) return inner;
  return inner?.items ?? inner?.results ?? [];
}

function toParticipant(a: AttendeeDto): Participant {
  const fullName = [a.first_name, a.last_name].filter(Boolean).join(' ');
  const email = a.attendee_email ?? a.email ?? undefined;
  const status = a.status ?? a.ticket_status;
  return {
    id: String(a.ticket_id ?? a.public_id ?? a.id),
    name: a.attendee_name || fullName || email || 'Unknown',
    email,
    ticketType: a.ticket_type_name,
    checkedIn: status === 'CHECKED_IN' || Boolean(a.checked_in_at),
    checkedInAt: a.checked_in_at ?? undefined,
  };
}

export async function getParticipants(eventId: string): Promise<Participant[]> {
  const all: AttendeeDto[] = [];
  let previousFirstId: string | undefined;

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const body = await apiRequest<unknown>(
      `/events/${eventId}/attendees?limit=${PAGE_SIZE}&offset=${offset}`
    );
    // console.log(JSON.stringify(body, null, 2)); // uncomment to see the real response
    const page = toArray(body);

    // stop if the backend ignores paging and returns the same page again
    const firstId = page[0] && String(page[0].ticket_id ?? page[0].id ?? page[0].public_id);
    if (offset > 0 && firstId && firstId === previousFirstId) break;
    previousFirstId = firstId;

    all.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return all.map(toParticipant);
}

// GET /events/{id} is owner-only on the backend, so an Event Admin can't use
// it. Look the event up in the assigned list instead, and add the counters
// from the attendee list when the backend allows it.
export async function getEventDetails(eventId: string): Promise<EventDetails | null> {
  const events = await getAssignedEvents();
  const event = events.find((e) => e.id === eventId);
  if (!event) return null;

  try {
    const participants = await getParticipants(eventId);
    return {
      ...event,
      registeredCount: participants.length,
      checkedInCount: participants.filter((p) => p.checkedIn).length,
    };
  } catch {
    // attendees not available for this user: show the event without counters
    return event;
  }
}

// ---------- check-in by QR ----------

// Shape returned by POST /events/{id}/check-in (backend TicketResponse).
interface TicketDto {
  ticket_id: string;
  order_number: number;
  ticket_type_name: string;
  attendee_name: string | null;
  attendee_email: string;
  status: string;
  checked_in_at: string | null;
}

// Admits the ticket behind a scanned QR code. Throws ApiError on failure:
//   409 TICKET_ALREADY_CHECKED_IN (details.checked_in_at), 409 TICKET_NOT_VALID,
//   401 INVALID_TICKET_QR, 404 TICKET_NOT_FOUND, 403 INSUFFICIENT_EVENT_PERMISSIONS.
export async function checkInTicket(eventId: string, qrPayload: string): Promise<CheckedInTicket> {
  const dto = await apiRequest<TicketDto>(`/events/${encodeURIComponent(eventId)}/check-in`, {
    method: 'POST',
    body: JSON.stringify({ qr_payload: qrPayload }),
  });
  return toCheckedInTicket(dto);
}

export async function searchEventTickets(
  eventId: string,
  query: string,
  options: { limit?: number; offset?: number } = {},
): Promise<EventTicket[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  const params = `q=${encodeURIComponent(trimmed)}&limit=${limit}&offset=${offset}`;

  const rows = await apiRequest<TicketSearchResultDto[]>(
    `/events/${encodeURIComponent(eventId)}/tickets/search?${params}`,
  );
  return rows.map(toEventTicket);
}

export async function manualCheckInTicket(
  eventId: string,
  publicId: string,
): Promise<CheckedInTicket> {
  const dto = await apiRequest<TicketDto>(
    `/events/${encodeURIComponent(eventId)}/tickets/${encodeURIComponent(publicId)}/check-in`,
    { method: 'POST' },
  );
  return toCheckedInTicket(dto);
}

export async function reverseCheckInTicket(
  eventId: string,
  publicId: string,
): Promise<CheckedInTicket> {
  const dto = await apiRequest<TicketDto>(
    `/events/${encodeURIComponent(eventId)}/tickets/${encodeURIComponent(publicId)}/reverse-check-in`,
    { method: 'POST' },
  );
  return toCheckedInTicket(dto);
}
// ---------- manual check-in ----------
// The backend only checks tickets in through a scanned QR code. There is no
// endpoint to check in or undo by participant yet, so these two fail on purpose
// instead of pretending to work.
export async function checkInParticipant(_eventId: string, _participantId: string): Promise<void> {
  throw new Error('Manual check-in is not available on the backend yet.');
}

export async function undoCheckInParticipant(
  _eventId: string,
  _participantId: string
): Promise<void> {
  throw new Error('Undo check-in is not available on the backend yet.');
}
