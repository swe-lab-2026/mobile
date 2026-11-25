export interface AssignedEvent {
  id: string;
  name: string;
  startsAt: string;
  endsAt?: string;
  location?: string;
  status?: string;
  timezone?: string;
  /**
   * Whether the current user may reverse check-ins for this event, as reported
   * by GET /events/assigned (owner, PLATFORM_ADMIN or EVENT_ADMIN). The
   * reversal endpoint enforces the same rule server-side.
   */
  canReverseCheckIn: boolean;
}

export type EventDetails = AssignedEvent;

export interface AttendanceStats {
  totalRegistered: number;
  totalCheckedIn: number;
  remaining: number;
  cancelled: number;
  refunded: number;
  totalIssued: number;
}

export interface EventTicket {
  ticketId: string;
  publicId: string;
  eventId: string;
  orderNumber: number;
  attendeeName: string | null;
  attendeeEmail: string;
  ticketType: string;
  status: string;
  issuedAt: string;
  checkedInAt: string | null;
  cancelledAt: string | null;
}

export interface CheckedInTicket {
  ticketId: string;
  publicId: string;
  eventId?: string;
  attendeeName: string | null;
  attendeeEmail: string;
  ticketType: string;
  status: string;
  checkedInAt: string | null;
  orderNumber: number;
}
