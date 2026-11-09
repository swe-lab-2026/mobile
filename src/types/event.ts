export interface EventCounters {
    registeredCount: number;
    checkedInCount: number;
}

export interface AssignedEvent {
    id: string;
    name: string;
    startsAt: string;
    endsAt?: string;
    location?: string;
    status?: string;
    timezone?: string
}

export interface EventDetails extends AssignedEvent, Partial<EventCounters> {
    organizer?: string;
}

export interface Participant {
  id: string;
  name: string;
  email?: string;
  ticketType?: string;
  checkedIn: boolean;
  checkedInAt?: string;
}

export interface CheckedInTicket {
  ticketId: string;
  attendeeName: string | null;
  attendeeEmail: string;
  ticketType: string;
  status: string;
  checkedInAt: string | null;
  orderNumber: number;
}