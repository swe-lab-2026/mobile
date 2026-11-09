import { apiRequest, ApiError } from '../client';
import { getAssignedEvents, getEventDetails, checkInTicket } from '../events';

jest.mock('../client', () => {
  const actual = jest.requireActual('../client');
  return { ...actual, apiRequest: jest.fn() };
});

const mockRequest = apiRequest as jest.Mock;
beforeEach(() => mockRequest.mockReset());

const dto = (id: string, title: string) => ({
  event_id: id,
  title,
  status: 'PUBLISHED',
  visibility: 'PUBLIC',
  starts_at: '2026-11-10T09:00:00Z',
  ends_at: '2026-11-10T17:00:00Z',
  venue_name: 'Astana Hub',
  city: 'Astana',
  timezone: 'Asia/Almaty',
});

describe('getAssignedEvents', () => {
  it('maps the backend fields', async () => {
    mockRequest.mockResolvedValue([dto('e1', 'Tech Conf')]);

    const [e] = await getAssignedEvents();

    expect(e).toMatchObject({
      id: 'e1',
      name: 'Tech Conf',
      startsAt: '2026-11-10T09:00:00Z',
      location: 'Astana Hub, Astana',
    });
  });

  it('keeps loading pages until one is not full', async () => {
    const full = Array.from({ length: 100 }, (_, i) => dto(`e${i}`, 'x'));
    mockRequest.mockResolvedValueOnce(full).mockResolvedValueOnce([dto('last', 'y')]);

    const all = await getAssignedEvents();

    expect(all).toHaveLength(101);
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });
});

describe('getEventDetails', () => {
  it('returns the matching event, or null', async () => {
    mockRequest.mockResolvedValue([dto('e1', 'Tech Conf')]);

    expect((await getEventDetails('e1'))?.name).toBe('Tech Conf');
    expect(await getEventDetails('nope')).toBeNull();
  });
});

describe('checkInTicket', () => {
  it('sends qr_payload and maps the ticket', async () => {
    mockRequest.mockResolvedValue({
      ticket_id: 't1',
      order_number: 42,
      ticket_type_name: 'Standard',
      attendee_name: 'Aigerim N',
      attendee_email: 'a@x.com',
      status: 'CHECKED_IN',
      checked_in_at: '2026-11-10T09:12:00Z',
    });

    const t = await checkInTicket('e1', 'PAYLOAD');

    expect(mockRequest).toHaveBeenCalledWith(
      '/events/e1/check-in',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ qr_payload: 'PAYLOAD' }) })
    );
    expect(t).toMatchObject({ ticketId: 't1', attendeeName: 'Aigerim N', orderNumber: 42 });
  });

  it('passes ApiError through, with the code and details', async () => {
    mockRequest.mockRejectedValue(
      new ApiError('Already', 409, 'TICKET_ALREADY_CHECKED_IN', { checked_in_at: '2026-11-10T09:30:00Z' })
    );

    await expect(checkInTicket('e1', 'P')).rejects.toMatchObject({
      status: 409,
      code: 'TICKET_ALREADY_CHECKED_IN',
      details: { checked_in_at: '2026-11-10T09:30:00Z' },
    });
  });
});