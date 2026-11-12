import { AssignedEvent, CheckedInTicket, EventDetails, Participant } from '../types/event';
import { apiRequest } from './client';

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

const PAGE_SIZE = 100; // the backend's maximum page size

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

// Only events where the current user is an Event Admin. The backend filters
// this in SQL, so nothing else can appear here.
export async function getAssignedEvents(): Promise<AssignedEvent[]> {
  const all: AssignedEvent[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await apiRequest<AssignedEventDto[]>(
      `/events/assigned?limit=${PAGE_SIZE}&offset=${offset}`
    );
    all.push(...page.map(toAssignedEvent));
    if (page.length < PAGE_SIZE) break;
  }
  return all;
}

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
  const dto = await apiRequest<TicketDto>(`/events/${eventId}/check-in`, {
    method: 'POST',
    body: JSON.stringify({ qr_payload: qrPayload }),
  });
  return {
    ticketId: dto.ticket_id,
    attendeeName: dto.attendee_name,
    attendeeEmail: dto.attendee_email,
    ticketType: dto.ticket_type_name,
    status: dto.status,
    checkedInAt: dto.checked_in_at,
    orderNumber: dto.order_number,
  };
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