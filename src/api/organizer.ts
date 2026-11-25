import { apiRequest } from './client';

export type EventVisibility = 'PUBLIC' | 'UNLISTED' | 'PRIVATE';

export type EventStatus =
  | 'DRAFT'
  | 'PUBLISHED'
  | 'UNPUBLISHED'
  | 'CANCELLED'
  | 'COMPLETED'
  | string;

export interface EventImageInput {
  object_key: string;
  alt_text?: string | null;
  sort_order?: number;
}

export interface EventImage {
  id: string;
  object_key: string;
  alt_text: string | null;
  sort_order: number;
}

export interface EventPayload {
  title: string;
  description: string | null;
  category: string | null;
  visibility: EventVisibility;
  venue_name: string | null;
  venue_address: string | null;
  city: string | null;
  country_code: string | null;
  timezone: string;
  starts_at: string;
  ends_at: string;
  registration_starts_at: string | null;
  registration_ends_at: string | null;
  capacity: number | null;
  refund_policy: string | null;
  images: EventImageInput[];
}

export interface EventRecord extends Omit<EventPayload, 'images'> {
  id: string;
  status: EventStatus;
  owner_user_id: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  latitude: string | null;
  longitude: string | null;
  images: EventImage[];
}

export interface TicketType {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  price: string;
  currency: string;
  capacity: number;
  min_per_order: number;
  max_per_order: number;
  sales_starts_at: string | null;
  sales_ends_at: string | null;
  is_hidden: boolean;
  is_free: boolean;
  created_at: string;
  updated_at: string;
}

export type TicketPayload = Omit<
  TicketType,
  'id' | 'event_id' | 'is_free' | 'created_at' | 'updated_at'
>;

export interface TicketInventoryItem {
  ticket_type_id: string;
  name: string;
  is_hidden: boolean;
  capacity: number;
  reserved: number;
  sold: number;
  returned: number;
  checked_in: number;
  available: number;
}

export interface Inventory {
  event_id: string;
  event_capacity: number | null;
  total_sold: number;
  total_reserved: number;
  total_available: number;
  ticket_types: TicketInventoryItem[];
}

export interface EventAdmin {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  permissions: Record<string, unknown>;
  assigned_at: string;
}

export interface Preview {
  event: EventRecord;
  ticket_types: TicketType[];
  publish_ready: boolean;
  validation_errors: string[];
}

export interface OrganizerProfile {
  user_id: string;
  display_name: string;
  legal_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  verification_status: string;
  terms_accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpdateUserPayload {
  first_name: string;
  last_name: string;
}

export interface OrganizerProfilePayload {
  display_name: string;
  legal_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  terms_accepted?: boolean;
}

function toJsonBody(body: unknown): string {
  return JSON.stringify(body);
}

export const organizerEvents = {
  list(limit = 100, offset = 0) {
    return apiRequest<EventRecord[]>(
      `/events?limit=${limit}&offset=${offset}`
    );
  },

  get(id: string) {
    return apiRequest<EventRecord>(`/events/${id}`);
  },

  create(body: EventPayload) {
    return apiRequest<EventRecord>('/events', {
      method: 'POST',
      body: toJsonBody(body),
    });
  },

  update(id: string, body: Partial<EventPayload>) {
    return apiRequest<EventRecord>(`/events/${id}`, {
      method: 'PATCH',
      body: toJsonBody(body),
    });
  },

  remove(id: string) {
    return apiRequest<void>(`/events/${id}`, {
      method: 'DELETE',
    });
  },

  duplicate(id: string) {
    return apiRequest<EventRecord>(`/events/${id}/duplicate`, {
      method: 'POST',
    });
  },

  preview(id: string) {
    return apiRequest<Preview>(`/events/${id}/preview`);
  },

  publish(id: string) {
    return apiRequest<EventRecord>(`/events/${id}/publish`, {
      method: 'POST',
    });
  },

  unpublish(id: string) {
    return apiRequest<EventRecord>(`/events/${id}/unpublish`, {
      method: 'POST',
    });
  },

  cancel(id: string) {
    return apiRequest<EventRecord>(`/events/${id}/cancel`, {
      method: 'POST',
    });
  },

  inventory(id: string) {
    return apiRequest<Inventory>(`/events/${id}/inventory`);
  },
};

export const ticketTypes = {
  list(eventId: string) {
    return apiRequest<TicketType[]>(`/events/${eventId}/ticket-types`);
  },

  create(eventId: string, body: TicketPayload) {
    return apiRequest<TicketType>(`/events/${eventId}/ticket-types`, {
      method: 'POST',
      body: toJsonBody(body),
    });
  },

  update(eventId: string, id: string, body: Partial<TicketPayload>) {
    return apiRequest<TicketType>(`/events/${eventId}/ticket-types/${id}`, {
      method: 'PATCH',
      body: toJsonBody(body),
    });
  },

  hide(eventId: string, id: string) {
    return apiRequest<void>(`/events/${eventId}/ticket-types/${id}`, {
      method: 'DELETE',
    });
  },
};

export const eventAdmins = {
  list(eventId: string) {
    return apiRequest<EventAdmin[]>(`/events/${eventId}/admins`);
  },

  assign(eventId: string, email: string) {
    return apiRequest<EventAdmin>(`/events/${eventId}/admins`, {
      method: 'POST',
      body: toJsonBody({ email }),
    });
  },

  remove(eventId: string, userId: string) {
    return apiRequest<void>(`/events/${eventId}/admins/${userId}`, {
      method: 'DELETE',
    });
  },
};

export const profileApi = {
  getUser() {
    return apiRequest<Record<string, unknown>>('/users/me');
  },

  updateUser(body: UpdateUserPayload) {
    return apiRequest<Record<string, unknown>>('/users/me', {
      method: 'PATCH',
      body: toJsonBody(body),
    });
  },

  getOrganizer() {
    return apiRequest<OrganizerProfile>('/organizers/me');
  },

  createOrganizer(body: OrganizerProfilePayload) {
    return apiRequest<OrganizerProfile>('/organizers/me', {
      method: 'POST',
      body: toJsonBody(body),
    });
  },

  updateOrganizer(body: Partial<OrganizerProfilePayload>) {
    return apiRequest<OrganizerProfile>('/organizers/me', {
      method: 'PATCH',
      body: toJsonBody(body),
    });
  },
};