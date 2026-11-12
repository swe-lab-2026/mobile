import type {
  AssignedEvent,
  AttendanceStats,
  CheckedInTicket,
  EventDetails,
  EventTicket,
} from "../types/event";
import { apiRequest } from "./client";

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
    location:
      [dto.venue_name, dto.city].filter(Boolean).join(", ") || undefined,
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

/** Returns events the current user can check in, including owned events. */
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

/** Event Admins use /events/assigned; /events/{id} is not always accessible. */
export async function getEventDetails(
  eventId: string,
): Promise<EventDetails | null> {
  const events = await getAssignedEvents();
  return events.find((event) => event.id === eventId) ?? null;
}

export async function getEventAttendanceStats(
  eventId: string,
): Promise<AttendanceStats> {
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
}

/** QR-based check-in; API errors are propagated to the scanner screen. */
export async function checkInTicket(
  eventId: string,
  qrPayload: string,
): Promise<CheckedInTicket> {
  const dto = await apiRequest<TicketDto>(
    `/events/${encodeURIComponent(eventId)}/check-in`,
    {
      method: "POST",
      body: JSON.stringify({ qr_payload: qrPayload }),
    },
  );
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
    { method: "POST" },
  );
  return toCheckedInTicket(dto);
}

export async function reverseCheckInTicket(
  eventId: string,
  publicId: string,
): Promise<CheckedInTicket> {
  const dto = await apiRequest<TicketDto>(
    `/events/${encodeURIComponent(eventId)}/tickets/${encodeURIComponent(publicId)}/reverse-check-in`,
    { method: "POST" },
  );
  return toCheckedInTicket(dto);
}
