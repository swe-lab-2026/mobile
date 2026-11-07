import { AssignedEvent, EventDetails, Participant } from '../types/event';

// TEMP: fake data for testing
const FAKE_EVENTS: Record<string, EventDetails> = {
  '1': {
    id: '1',
    name: 'fake event 1',
    startsAt: '2026-11-10T09:00:00Z',
    endsAt: '2026-11-10T17:00:00Z',
    location: 'Gotham',
    organizer: 'Wayne Enterprises',
    registeredCount: 420,
    checkedInCount: 69,
  },
  '2': {
    id: '2',
    name: 'fake event 2',
    startsAt: '2026-12-01T18:00:00Z',
    endsAt: '2026-12-01T22:00:00Z',
    location: 'Gotham2',
    organizer: 'Wayne Enterprises',
    registeredCount: 67,
    checkedInCount: 0,
  },
};

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

export function getAssignedEvents(): Promise<AssignedEvent[]> {
  return Promise.resolve(
    Object.values(FAKE_EVENTS).map(({ id, name, startsAt, endsAt, location }) => ({
      id,
      name,
      startsAt,
      endsAt,
      location,
    }))
  );
}

export function getEventDetails(eventId: string): Promise<EventDetails | null> {
  return Promise.resolve(FAKE_EVENTS[eventId] ?? null);
}

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