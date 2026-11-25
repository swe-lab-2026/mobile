import { ApiError, apiRequest } from './client';

function toArray(body: any): any[] {
  if (Array.isArray(body)) return body;
  const inner = body?.data ?? body;
  if (Array.isArray(inner)) return inner;
  return inner?.items ?? inner?.results ?? [];
}

export interface OrderSummary {
  id: string;
  number?: string;
  eventTitle: string;
  createdAt?: string;
  status: string;
  total: number;
  currency: string;
  ticketCount?: number;
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
  eventPlace?: string;
  lines: OrderLine[];
  tickets: OrderTicket[];
}

function toOrderSummary(o: any): OrderSummary {
  return {
    id: String(o.id ?? o.order_id),
    number: o.order_number != null ? String(o.order_number) : undefined,
    eventTitle: o.event_title ?? o.event?.title ?? '',
    createdAt: o.created_at ?? o.paid_at,
    status: o.status ?? 'PENDING',
    total: Number(o.total_amount ?? o.total ?? o.amount ?? 0),
    currency: o.currency ?? 'KZT',
    ticketCount: o.ticket_count ?? o.tickets_count ?? o.items?.length ?? o.quantity,
  };
}

function toTicket(t: any): OrderTicket {
  return {
    id: String(t.ticket_id ?? t.public_id ?? t.id),
    typeName: t.ticket_type_name ?? t.ticket_type,
    attendeeName:
      t.attendee_name ?? ([t.first_name, t.last_name].filter(Boolean).join(' ') || undefined),
    status: t.status ?? 'VALID',
    qrPayload: t.qr_payload ?? t.qr_token ?? t.qr_code ?? t.qr ?? t.public_id,
  };
}

export interface CreateOrderInput {
  eventId: string;
  items: { ticketTypeId: string; quantity: number }[];
  promoCode?: string;
}

export interface CreatedOrder {
  id: string;
  status: string;
  paymentUrl?: string;
}

// ASSUMPTION: POST /orders with this body. The repo only shows the read side
// (GET /orders, /orders/{id}, /orders/{id}/tickets); adjust paths/fields here if
// the backend contract differs.
export async function createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
  const body = await apiRequest<any>('/orders', {
    method: 'POST',
    body: JSON.stringify({
      event_id: input.eventId,
      items: input.items.map((i) => ({ ticket_type_id: i.ticketTypeId, quantity: i.quantity })),
      promo_code: input.promoCode || undefined,
    }),
  });
  const o = body?.data ?? body;
  return {
    id: String(o.id ?? o.order_id),
    status: o.status ?? 'PENDING',
    paymentUrl: o.payment_url ?? o.checkout_url ?? undefined,
  };
}

export async function getOrders(): Promise<OrderSummary[]> {
  const body = await apiRequest<unknown>('/orders?limit=100&offset=0');
  return toArray(body)
    .map(toOrderSummary)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')); // newest first
}

export async function getOrder(orderId: string): Promise<OrderDetail> {
  const [orderBody, ticketsBody] = await Promise.all([
    apiRequest<any>(`/orders/${orderId}`),
    apiRequest<unknown>(`/orders/${orderId}/tickets`).catch(() => []),
  ]);
  const o = orderBody?.data ?? orderBody;
  const event = o.event ?? {};

  return {
    ...toOrderSummary(o),
    eventStartsAt: event.starts_at ?? o.event_starts_at,
    eventPlace:
      [event.venue_name ?? o.venue_name, event.city ?? o.city].filter(Boolean).join(', ') ||
      undefined,
    lines: (o.items ?? o.lines ?? []).map((i: any) => ({
      name: i.ticket_type_name ?? i.name ?? '',
      quantity: Number(i.quantity ?? 1),
      total: Number(i.total_amount ?? i.total ?? i.unit_price ?? 0),
    })),
    tickets: toArray(ticketsBody).map(toTicket),
  };
}

export interface Me {
  firstName: string;
  lastName: string;
  email: string;
  verified: boolean;
}

export async function getMe(): Promise<Me> {
  const body = await apiRequest<any>('/users/me');
  const u = body?.data ?? body;
  return {
    firstName: u.first_name ?? '',
    lastName: u.last_name ?? '',
    email: u.email ?? '',
    verified: Boolean(u.email_verified ?? u.email_verified_at),
  };
}

export function updateMe(input: { firstName: string; lastName: string }) {
  return apiRequest<unknown>('/users/me', {
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
    const body = await apiRequest<any>('/organizers/me');
    const o = body?.data ?? body;
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
  return apiRequest<unknown>('/organizers/me', {
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