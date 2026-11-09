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

// GET /events/{id} is owner-only on the backend, so an Event Admin can't use
// it. Look the event up in the assigned list instead.
export async function getEventDetails(eventId: string): Promise<EventDetails | null> {
  const events = await getAssignedEvents();
  return events.find((e) => e.id === eventId) ?? null;
}

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

const FAKE_PARTICIPANTS: Record<string, Participant[]> = {
  '1': [
    { id: 'p1', name: 'Aigerim Nurlan', email: 'aigerim@example.com', ticketType: 'General', checkedIn: true, checkedInAt: '2026-11-10T09:12:00Z' },
    { id: 'p2', name: 'Daniyar Omarov', email: 'daniyar@example.com', ticketType: 'VIP', checkedIn: false },
    { id: 'p3', name: 'Madina Sadykova', email: 'madina@example.com', ticketType: 'General', checkedIn: false },
  ],
  '2': [
    { id: 'p4', name: 'Timur Bekov', email: 'timur@example.com', ticketType: 'General', checkedIn: false },
  ],
};

export function getParticipants(eventId: string): Promise<Participant[]> {
  return Promise.resolve((FAKE_PARTICIPANTS[eventId] ?? []).map((p) => ({ ...p })));
}

export function checkInParticipant(eventId: string, participantId: string): Promise<void> {
  const p = FAKE_PARTICIPANTS[eventId]?.find((x) => x.id === participantId);
  if (p) {
    p.checkedIn = true;
    p.checkedInAt = new Date().toISOString();
  }
  return Promise.resolve();
}

export function undoCheckInParticipant(eventId: string, participantId: string): Promise<void> {
  const p = FAKE_PARTICIPANTS[eventId]?.find((x) => x.id === participantId);
  if (p) {
    p.checkedIn = false;
    p.checkedInAt = undefined;
  }
  return Promise.resolve();
}