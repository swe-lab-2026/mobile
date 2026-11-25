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
  eventId?: string;
  eventTitle: string;
  ticketNames?: string; 
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
  const tickets: any[] = Array.isArray(o.tickets) ? o.tickets : [];
  const items: any[] = Array.isArray(o.items) ? o.items : [];
  const first = tickets[0] ?? {};

  const ticketNames = items
    .map((i) => (i.ticket_type_name ? `${i.ticket_type_name} × ${Number(i.quantity ?? 1)}` : ''))
    .filter(Boolean)
    .join(', ');
  const quantity = items.reduce((sum, i) => sum + Number(i.quantity ?? 1), 0);

  return {
    id: String(o.id ?? o.order_id),
    number: o.order_number != null ? String(o.order_number) : undefined,
    eventId: o.event_id ? String(o.event_id) : undefined,
    eventTitle: first.event_title ?? o.event_title ?? '',
    ticketNames: ticketNames || undefined,
    createdAt: o.created_at ?? o.paid_at,
    status: o.status ?? 'PENDING',
    total: Number(o.total_amount ?? 0),
    currency: o.currency ?? 'KZT',
    ticketCount: tickets.length || quantity || undefined,
  };
}

function toTicket(t: any): OrderTicket {
  return {
    id: String(t.ticket_id ?? t.public_id),
    typeName: t.ticket_type_name ?? undefined,
    attendeeName: t.attendee_name ?? undefined,
    status: t.status ?? 'VALID',
    qrPayload: t.qr_payload ?? undefined,
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
  const list = toArray(body).map(toOrderSummary);

  // safety net: if an order came without its tickets, read the title from /orders/{id}/tickets
  await Promise.all(
    list
      .filter((o) => !o.eventTitle)
      .map(async (o) => {
        try {
          const tickets = toArray(await apiRequest<unknown>(`/orders/${o.id}/tickets`));
          o.eventTitle = tickets[0]?.event_title ?? '';
        } catch {
          // keep it empty; the screen shows the order number instead
        }
      }),
  );

  return list.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')); // newest first
}

export async function getOrder(orderId: string): Promise<OrderDetail> {
  const body: any = await apiRequest<any>(`/orders/${orderId}`);
  const o = body?.data ?? body;

  let rawTickets: any[] = Array.isArray(o.tickets) ? o.tickets : [];
  if (rawTickets.length === 0) {
    rawTickets = toArray(
      await apiRequest<unknown>(`/orders/${orderId}/tickets`).catch(() => []),
    );
  }

  const first = rawTickets[0] ?? {};
  const summary = toOrderSummary({ ...o, tickets: rawTickets });

  return {
    ...summary,
    eventStartsAt: first.event_starts_at ?? undefined,
    eventPlace: [first.venue_name, first.city].filter(Boolean).join(', ') || undefined,
    lines: (Array.isArray(o.items) ? o.items : []).map((i: any) => ({
      name: i.ticket_type_name ?? '',
      quantity: Number(i.quantity ?? 1),
      total: Number(i.subtotal ?? i.final_price ?? 0),
    })),
    tickets: rawTickets.map(toTicket),
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