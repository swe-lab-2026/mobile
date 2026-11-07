export interface EventCounters {
    registeredCount: number;
    checkedInCount: number;
}

export interface AssignedEvent {
    id: string;
    name: string;
    startsAt: string;
    endsAt: string;
    location: string;
}

export interface EventDetails extends AssignedEvent, EventCounters {
    organizer: string;
}

export interface Participant {
  id: string;
  name: string;
  email?: string;
  ticketType?: string;
  checkedIn: boolean;
  checkedInAt?: string;
}