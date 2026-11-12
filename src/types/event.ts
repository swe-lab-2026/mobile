export interface AssignedEvent {
  id: string;
  name: string;
  startsAt: string;
  endsAt?: string;
  location?: string;
  status?: string;
  timezone?: string;
}

export interface EventDetails extends AssignedEvent {
  organizer?: string;
}

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
  attendeeName: string | null;
  attendeeEmail: string;
  ticketType: string;
  status: string;
  checkedInAt: string | null;
  orderNumber: number;
}
