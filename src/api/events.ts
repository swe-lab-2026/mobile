import { AssignedEvent, EventDetails, Participant } from '../types/event';

// TEMP: fake data for testing
export function getAssignedEvents(): Promise<AssignedEvent[]>{
  return Promise.resolve([
    { 
      id: '1',
      name: 'fake event 1',
      startsAt: 'right now',
      location: 'Gotham'
    },
    {
      id: '2',
      name: 'fake event 2',
      startsAt: 'not right now',
      location: 'Gotham2'
    },
  ]);
}

export function getEventDetails(eventId: string): Promise<EventDetails> {
  const fakeEvents: Record<string, EventDetails> = {
    '1': {
      id: '1',
      name: 'fake event 1',
      startsAt: 'right now',
      location: 'Gotham',
      registeredCount: 420,
      checkedInCount: 69,
    },
    '2': {
      id: '2',
      name: 'fake event 2',
      startsAt: 'not right now',
      location: 'Gotham2',
      registeredCount: 67,
      checkedInCount: 0,
    },
  };
  return Promise.resolve(fakeEvents[eventId]);
}

export interface Participant {
  id: string;
  name: string;
  email?: string;
  ticketType?: string;
  checkedIn: boolean;
  checkedInAt?: string;
}

export async function getParticipants(eventId: string): Promise<Participant[]> {
  const res = await api.get(`/events/${eventId}/attendees`);
  const items = res.data.data; // backend wraps responses as { data: ... }

  return items.map((a: any) => ({
    id: a.ticket_id ?? a.id,
    name: a.full_name ?? a.name,
    email: a.email,
    ticketType: a.ticket_type ?? a.ticket_type_name,
    checkedIn: a.status === 'CHECKED_IN',
    checkedInAt: a.checked_in_at,
  }));
}

export async function checkInParticipant(eventId: string, participantId: string) {
  throw new Error('Not implemented on backend yet');
}

export async function undoCheckInParticipant(eventId: string, participantId: string) {
  throw new Error('Not implemented on backend yet');
}
