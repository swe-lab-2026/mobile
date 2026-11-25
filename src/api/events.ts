import type {
  AssignedEvent,
  AttendanceStats,
  CheckedInTicket,
  EventTicket,
} from "../types/event";
import { apiRequest } from "./client";

export interface AssignedEventDto {
  event_id: string;
  title: string;
  status: string;
  visibility: string;
  starts_at: string;
  ends_at: string;
  venue_name: string | null;
  city: string | null;
  timezone: string;
  /** Caller-specific; mirrors the backend reversal gate. */
  can_reverse_check_in?: boolean | null;
}

export interface TicketDto {
  ticket_id: string;
  public_id: string;
  order_number: number;
  event_id?: string;
  event_title?: string;
  ticket_type_name: string;
  attendee_name: string | null;
  attendee_email: string;
  status: string;
  checked_in_at: string | null;
}

export interface TicketSearchResultDto {
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

export interface AttendanceStatsDto {
  event_id: string;
  total_registered: number;
  total_checked_in: number;
  remaining: number;
  cancelled: number;
  refunded: number;
  total_issued: number;
}

/** Backend maximum for GET /events/assigned. */
const ASSIGNED_PAGE_SIZE = 100;
/** Page size for ticket search (backend maximum is 200). */
export const SEARCH_PAGE_SIZE = 50;

export function toAssignedEvent(dto: AssignedEventDto): AssignedEvent {
  return {
    // The backend flag is authoritative. If an older backend omits it, the
    // reversal action stays hidden; the endpoint would enforce it anyway.
    canReverseCheckIn: dto.can_reverse_check_in === true,
    id: dto.event_id,
    name: dto.title,
    startsAt: dto.starts_at,
    endsAt: dto.ends_at,
    location: [dto.venue_name, dto.city].filter(Boolean).join(", ") || undefined,
    status: dto.status,
    timezone: dto.timezone,
  };
}

export function toCheckedInTicket(dto: TicketDto): CheckedInTicket {
  return {
    ticketId: dto.ticket_id,
    publicId: dto.public_id,
    eventId: dto.event_id,
    attendeeName: dto.attendee_name,
    attendeeEmail: dto.attendee_email,
    ticketType: dto.ticket_type_name,
    status: dto.status,
    checkedInAt: dto.checked_in_at,
    orderNumber: dto.order_number,
  };
}

export function toEventTicket(dto: TicketSearchResultDto): EventTicket {
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

export function toAttendanceStats(dto: AttendanceStatsDto): AttendanceStats {
  return {
    totalRegistered: dto.total_registered,
    totalCheckedIn: dto.total_checked_in,
    remaining: dto.remaining,
    cancelled: dto.cancelled,
    refunded: dto.refunded,
    totalIssued: dto.total_issued,
  };
}

/** Check-in progress in percent (0–100), computed only from authoritative stats. */
export function attendancePercent(stats: AttendanceStats | null | undefined): number {
  if (!stats || stats.totalRegistered <= 0) return 0;
  return Math.round(Math.min(stats.totalCheckedIn / stats.totalRegistered, 1) * 100);
}

/**
 * Events the current user may verify tickets for: events they own plus
 * events with an active EVENT_ADMIN / CHECK_IN_STAFF assignment. This is the
 * single source of truth for admission access in the app.
 */
export async function getAssignedEvents(): Promise<AssignedEvent[]> {
  const all: AssignedEvent[] = [];

  for (let offset = 0; ; offset += ASSIGNED_PAGE_SIZE) {
    const page = await apiRequest<AssignedEventDto[]>(
      `/events/assigned?limit=${ASSIGNED_PAGE_SIZE}&offset=${offset}`,
    );
    all.push(...page.map(toAssignedEvent));
    if (page.length < ASSIGNED_PAGE_SIZE) break;
  }

  return all;
}

/**
 * One event from /events/assigned, or null when the user has no admission
 * access to it (never assigned, assignment revoked, or deleted). Re-queried on
 * every call so a revoked assignment is noticed immediately.
 */
export async function getAccessibleEvent(eventId: string): Promise<AssignedEvent | null> {
  const events = await getAssignedEvents();
  return events.find((event) => event.id === eventId) ?? null;
}

export async function getEventAttendanceStats(eventId: string): Promise<AttendanceStats> {
  const dto = await apiRequest<AttendanceStatsDto>(
    `/events/${encodeURIComponent(eventId)}/tickets/stats`,
  );
  return toAttendanceStats(dto);
}

/** QR-based check-in. Printed and digital tickets carry the same payload. */
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

export interface TicketSearchPage {
  items: EventTicket[];
  offset: number;
  /** True when the server returned a full page, so another page may exist. */
  hasMore: boolean;
}

/**
 * Server-side search over an event's tickets by attendee name, email, order
 * number or ticket identifier. The backend requires a non-blank query: staff
 * have search access, not a bulk attendee export.
 */
export async function searchEventTickets(
  eventId: string,
  query: string,
  options: { limit?: number; offset?: number; signal?: AbortSignal } = {},
): Promise<TicketSearchPage> {
  const trimmed = query.trim();
  const limit = options.limit ?? SEARCH_PAGE_SIZE;
  const offset = options.offset ?? 0;
  if (!trimmed) {
    throw new Error("searchEventTickets requires a non-blank query");
  }

  const params = `q=${encodeURIComponent(trimmed)}&limit=${limit}&offset=${offset}`;
  const rows = await apiRequest<TicketSearchResultDto[]>(
    `/events/${encodeURIComponent(eventId)}/tickets/search?${params}`,
    { signal: options.signal },
  );
  return { items: rows.map(toEventTicket), offset, hasMore: rows.length === limit };
}

/** Appends a page, dropping tickets already present (rows can shift between pages). */
export function mergeTicketPages(existing: EventTicket[], next: EventTicket[]): EventTicket[] {
  const seen = new Set(existing.map((ticket) => ticket.publicId));
  return [...existing, ...next.filter((ticket) => !seen.has(ticket.publicId))];
}

/** Replaces one ticket in a list after a check-in or reversal. */
export function replaceTicket(list: EventTicket[], updated: CheckedInTicket): EventTicket[] {
  return list.map((ticket) =>
    ticket.publicId === updated.publicId
      ? { ...ticket, status: updated.status, checkedInAt: updated.checkedInAt }
      : ticket,
  );
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

interface CatalogEventDto {
  id: string;
  title: string;
  visibility: string;
  status: string;
  starts_at: string;
  ends_at: string;
  venue_name: string | null;
  city: string | null;
  timezone: string;
  capacity: number | null;
  created_at: string;
  updated_at: string;
}

export interface CatalogEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  venueName?: string;
  city?: string;
  timezone: string;
}

const CATALOG_PAGE_SIZE = 100;

export async function getCatalogEvents(): Promise<CatalogEvent[]> {
  const all: CatalogEvent[] = [];

  for (let offset = 0; ; offset += CATALOG_PAGE_SIZE) {
    const page = await apiRequest<CatalogEventDto[]>(
      `/events/catalog?limit=${CATALOG_PAGE_SIZE}&offset=${offset}`,
      { skipAuth: true }
    );

    all.push(
      ...page.map((e) => ({
        id: e.id,
        title: e.title,
        startsAt: e.starts_at,
        endsAt: e.ends_at,
        venueName: e.venue_name ?? undefined,
        city: e.city ?? undefined,
        timezone: e.timezone,
      }))
    );

    if (page.length < CATALOG_PAGE_SIZE) break;
  }

  return all;
}
