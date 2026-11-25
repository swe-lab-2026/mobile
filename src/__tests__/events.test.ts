import { apiRequest } from '../api/client';
import {
  attendancePercent,
  getAccessibleEvent,
  mergeTicketPages,
  replaceTicket,
  searchEventTickets,
  toAssignedEvent,
  toAttendanceStats,
  type AssignedEventDto,
} from '../api/events';
import type { EventTicket } from '../types/event';

jest.mock('../api/client', () => {
  const actual = jest.requireActual('../api/client');
  return { ...actual, apiRequest: jest.fn() };
});

const mockedRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;

const assignedDto = (overrides: Partial<AssignedEventDto> = {}): AssignedEventDto => ({
  event_id: 'e1',
  title: 'Demo Day',
  status: 'PUBLISHED',
  visibility: 'PUBLIC',
  starts_at: '2026-12-01T10:00:00+05:00',
  ends_at: '2026-12-01T18:00:00+05:00',
  venue_name: 'Hall A',
  city: 'Astana',
  timezone: 'Asia/Almaty',
  can_reverse_check_in: true,
  ...overrides,
});

const ticket = (publicId: string, status = 'VALID'): EventTicket => ({
  ticketId: `t-${publicId}`,
  publicId,
  eventId: 'e1',
  orderNumber: 1,
  attendeeName: 'A',
  attendeeEmail: 'a@example.com',
  ticketType: 'General',
  status,
  issuedAt: '2026-11-01T00:00:00Z',
  checkedInAt: null,
  cancelledAt: null,
});

beforeEach(() => mockedRequest.mockReset());

describe('assigned events', () => {
  it('maps the DTO, using the backend reversal flag as authoritative', () => {
    expect(toAssignedEvent(assignedDto())).toEqual({
      id: 'e1',
      name: 'Demo Day',
      startsAt: '2026-12-01T10:00:00+05:00',
      endsAt: '2026-12-01T18:00:00+05:00',
      location: 'Hall A, Astana',
      status: 'PUBLISHED',
      timezone: 'Asia/Almaty',
      canReverseCheckIn: true,
    });
    // CHECK_IN_STAFF: backend says false.
    expect(toAssignedEvent(assignedDto({ can_reverse_check_in: false })).canReverseCheckIn).toBe(false);
    // Unknown (older backend): reversal stays hidden.
    expect(toAssignedEvent(assignedDto({ can_reverse_check_in: undefined })).canReverseCheckIn).toBe(false);
    expect(toAssignedEvent(assignedDto({ venue_name: null, city: null })).location).toBeUndefined();
  });

  it('paginates /events/assigned and finds an event by id', async () => {
    const firstPage = Array.from({ length: 100 }, (_, i) => assignedDto({ event_id: `p${i}` }));
    mockedRequest.mockResolvedValueOnce(firstPage).mockResolvedValueOnce([assignedDto({ event_id: 'target' })]);

    const found = await getAccessibleEvent('target');
    expect(found?.id).toBe('target');
    expect(mockedRequest).toHaveBeenNthCalledWith(1, '/events/assigned?limit=100&offset=0');
    expect(mockedRequest).toHaveBeenNthCalledWith(2, '/events/assigned?limit=100&offset=100');
  });

  it('returns null for an event the user is not (or no longer) assigned to', async () => {
    mockedRequest.mockResolvedValueOnce([assignedDto()]);
    await expect(getAccessibleEvent('revoked')).resolves.toBeNull();
  });
});

describe('ticket search', () => {
  it('builds an encoded, paginated server-side query', async () => {
    mockedRequest.mockResolvedValueOnce([]);
    await searchEventTickets('e1', '  a+b@x.kz ', { offset: 50, limit: 50 });
    const [path] = mockedRequest.mock.calls[0];
    expect(path).toBe('/events/e1/tickets/search?q=a%2Bb%40x.kz&limit=50&offset=50');
  });

  it('reports hasMore only for full pages (no hidden result cap)', async () => {
    const full = Array.from({ length: 50 }, (_, i) => ({
      ticket_id: `t${i}`,
      public_id: `p${i}`,
      event_id: 'e1',
      order_number: i,
      attendee_name: null,
      attendee_email: 'x@y.z',
      ticket_type_name: 'GA',
      status: 'VALID',
      issued_at: '',
      checked_in_at: null,
      cancelled_at: null,
    }));
    mockedRequest.mockResolvedValueOnce(full).mockResolvedValueOnce(full.slice(0, 3));
    expect((await searchEventTickets('e1', 'x')).hasMore).toBe(true);
    expect((await searchEventTickets('e1', 'x', { offset: 50 })).hasMore).toBe(false);
  });

  it('refuses a blank query instead of pretending the event has no attendees', async () => {
    await expect(searchEventTickets('e1', '   ')).rejects.toThrow();
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('merges pages without duplicates and updates a ticket in place', () => {
    const merged = mergeTicketPages([ticket('a'), ticket('b')], [ticket('b'), ticket('c')]);
    expect(merged.map((t) => t.publicId)).toEqual(['a', 'b', 'c']);

    const updated = replaceTicket(merged, {
      ticketId: 't-b',
      publicId: 'b',
      attendeeName: 'A',
      attendeeEmail: 'a@example.com',
      ticketType: 'General',
      status: 'CHECKED_IN',
      checkedInAt: '2026-12-01T10:05:00Z',
      orderNumber: 1,
    });
    expect(updated[1]).toMatchObject({ status: 'CHECKED_IN', checkedInAt: '2026-12-01T10:05:00Z' });
    expect(updated[0].status).toBe('VALID');
  });
});

describe('attendance statistics', () => {
  const dto = {
    event_id: 'e1',
    total_registered: 40,
    total_checked_in: 10,
    remaining: 30,
    cancelled: 3,
    refunded: 2,
    total_issued: 45,
  };

  it('maps backend counters verbatim', () => {
    expect(toAttendanceStats(dto)).toEqual({
      totalRegistered: 40,
      totalCheckedIn: 10,
      remaining: 30,
      cancelled: 3,
      refunded: 2,
      totalIssued: 45,
    });
  });

  it('computes percentages from authoritative stats only', () => {
    expect(attendancePercent(toAttendanceStats(dto))).toBe(25);
    expect(attendancePercent(null)).toBe(0);
    expect(attendancePercent({ ...toAttendanceStats(dto), totalRegistered: 0, totalCheckedIn: 0 })).toBe(0);
  });
});
