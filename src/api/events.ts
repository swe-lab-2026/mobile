import { AssignedEvent, EventDetails } from '../types/event';

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
