import { ApiError, apiRequest } from './client';

// ---- Backend DTOs (app/schemas/orders.py, tickets.py, users.py, organizers.py) ----

interface OrderItemDto {
  ticket_type_id: string;
  ticket_type_name: string;
  quantity: number;
  unit_price: string;
  subtotal: string;
  final_price: string;
}

interface OrderTicketDto {
  ticket_id: string;
  public_id: string;
  order_id: string;
  event_title: string;
  event_starts_at: string;
  venue_name: string | null;
  city: string | null;
  timezone: string;
  ticket_type_name: string;
  attendee_name: string | null;
  status: string;
  qr_payload: string;
}

export interface OrderDto {
  id: string;
  order_id: string;
  order_number: number;
  event_id: string;
  status: string;
  currency: string;
  total_amount: string;
  created_at: string;
  paid_at: string | null;
  items: OrderItemDto[];
  tickets: OrderTicketDto[];
}

interface UserDto {
  first_name: string;
  last_name: string;
  email: string;
  email_verified_at: string | null;
}

interface OrganizerDto {
  display_name: string;
  legal_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  verification_status: string;
}

// ---- App models ----

export interface OrderSummary {
  id: string;
  number?: string;
  eventId?: string;
  /** Empty when the order has no issued tickets yet (e.g. pending payment). */
  eventTitle: string;
  /** Ticket types with quantities, e.g. "VIP × 2". */
  ticketNames?: string;
  createdAt?: string;
  status: string;
  total: number;
  currency: string;
  ticketCount: number;
}

export interface OrderLine {
  name: string;
  quantity: number;
  total: number;
}

export interface OrderTicket {
  id: string;
  typeName?: string;
  attendeeName?: string;
  status: string;
  qrPayload?: string;
}

export interface OrderDetail extends OrderSummary {
  eventStartsAt?: string;
  eventTimeZone?: string;
  eventPlace?: string;
  lines: OrderLine[];
  tickets: OrderTicket[];
}

export function toOrderSummary(o: OrderDto): OrderSummary {
  const tickets = o.tickets ?? [];
  const items = o.items ?? [];
  // e.g. "VIP × 2, Standard × 1", shown as a chip in the order list.
  const ticketNames = items
    .filter((item) => item.ticket_type_name)
    .map((item) => `${item.ticket_type_name} × ${item.quantity}`)
    .join(', ');
  return {
    id: String(o.id ?? o.order_id),
    number: o.order_number != null ? String(o.order_number) : undefined,
    eventId: o.event_id ? String(o.event_id) : undefined,
    // OrderResponse has no event title; every issued ticket carries it.
    eventTitle: tickets[0]?.event_title ?? '',
    ticketNames: ticketNames || undefined,
    createdAt: o.created_at ?? o.paid_at ?? undefined,
    status: o.status,
    total: Number(o.total_amount),
    currency: o.currency,
    ticketCount: tickets.length || items.reduce((sum, item) => sum + item.quantity, 0),
  };
}

function toTicket(t: OrderTicketDto): OrderTicket {
  return {
    // public_id is the identifier staff can search by at the venue.
    id: t.public_id,
    typeName: t.ticket_type_name,
    attendeeName: t.attendee_name ?? undefined,
    status: t.status,
    qrPayload: t.qr_payload,
  };
}

export function toOrderDetail(o: OrderDto): OrderDetail {
  const first = o.tickets?.[0];
  return {
    ...toOrderSummary(o),
    eventStartsAt: first?.event_starts_at,
    eventTimeZone: first?.timezone,
    eventPlace: first ? [first.venue_name, first.city].filter(Boolean).join(', ') || undefined : undefined,
    lines: (o.items ?? []).map((i) => ({
      name: i.ticket_type_name,
      quantity: i.quantity,
      total: Number(i.final_price ?? i.subtotal),
    })),
    tickets: (o.tickets ?? []).map(toTicket),
  };
}

export async function getOrders(): Promise<OrderSummary[]> {
  const rows = await apiRequest<OrderDto[]>('/orders?limit=200&offset=0');
  return rows
    .map(toOrderSummary)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')); // newest first
}

export async function getOrder(orderId: string): Promise<OrderDetail> {
  const order = await apiRequest<OrderDto>(`/orders/${encodeURIComponent(orderId)}`);
  return toOrderDetail(order);
}

export interface Me {
  firstName: string;
  lastName: string;
  email: string;
  verified: boolean;
}

export async function getMe(): Promise<Me> {
  const u = await apiRequest<UserDto>('/users/me');
  return {
    firstName: u.first_name ?? '',
    lastName: u.last_name ?? '',
    email: u.email ?? '',
    verified: Boolean(u.email_verified_at),
  };
}

export function updateMe(input: { firstName: string; lastName: string }) {
  return apiRequest<UserDto>('/users/me', {
    method: 'PATCH',
    body: JSON.stringify({ first_name: input.firstName, last_name: input.lastName }),
  });
}

export interface Organizer {
  displayName: string;
  legalName: string;
  contactEmail: string;
  contactPhone: string;
  verificationStatus: string;
}

export async function getOrganizer(): Promise<Organizer | null> {
  try {
    const o = await apiRequest<OrganizerDto>('/organizers/me');
    return {
      displayName: o.display_name ?? '',
      legalName: o.legal_name ?? '',
      contactEmail: o.contact_email ?? '',
      contactPhone: o.contact_phone ?? '',
      verificationStatus: o.verification_status ?? 'NOT_SUBMITTED',
    };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export function saveOrganizer(
  exists: boolean,
  input: { displayName: string; legalName: string; contactEmail: string; contactPhone: string }
) {
  const body: Record<string, unknown> = {
    display_name: input.displayName,
    legal_name: input.legalName || null,
    contact_email: input.contactEmail || null,
    contact_phone: input.contactPhone || null,
  };
  if (!exists) body.terms_accepted = true;
  return apiRequest<OrganizerDto>('/organizers/me', {
    method: exists ? 'PATCH' : 'POST',
    body: JSON.stringify(body),
  });
}

export function savePayoutAccount(input: { provider: string; ref: string; isDefault: boolean }) {
  return apiRequest<unknown>('/organizers/me/payout-account', {
    method: 'PUT',
    body: JSON.stringify({
      provider: input.provider,
      external_account_ref: input.ref,
      is_default: input.isDefault,
    }),
  });
}
