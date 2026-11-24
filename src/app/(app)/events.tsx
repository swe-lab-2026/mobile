
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '../../api/client';
import { getAssignedEvents } from '../../api/events';
import { organizerEvents, EventRecord } from '../../api/organizer';
import { Action, Busy, Card, Page } from '../../components/organizer-ui';
import { useAuth } from '../../store/auth-context';
import { useSelectedEvent } from '../../store/selected-event-context';

const filters = [
  'ALL',
  'DRAFT',
  'PUBLISHED',
  'UNPUBLISHED',
  'COMPLETED',
  'CANCELLED',
];

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'NETWORK_ERROR') {
      return 'Cannot reach the server. Check your connection.';
    }
    return error.message;
  }

  return 'Could not load your events.';
}

function formatDate(value: string) {
  const date = new Date(value);

  if (isNaN(date.getTime())) {
    return 'Date not available';
  }

  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function EventsListScreen() {
  const { logout, user } = useAuth();
  const { selectEvent } = useSelectedEvent();

  const [events, setEvents] = useState<EventRecord[]>([]);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load organizer-owned events and events assigned to the admin.
  const load = useCallback(async () => {
    try {
      let ownEvents: EventRecord[] = [];

      // Event admins might not have access to organizer-owned events.
      try {
        ownEvents = await organizerEvents.list();
      } catch {
        ownEvents = [];
      }

      const assignedEvents = await getAssignedEvents();

      // Convert assigned events into the organizer event format.
      const mappedAssignedEvents = assignedEvents.map((event) => ({
        id: event.id,
        title: event.name,
        status: event.status ?? 'ASSIGNED',
        visibility: 'PRIVATE',
        starts_at: event.startsAt,
        ends_at: event.endsAt ?? event.startsAt,
        venue_name: event.location ?? null,
        city: null,
        timezone: event.timezone ?? 'Asia/Almaty',
        capacity: null,
        created_at: '',
        updated_at: '',
        owner_user_id: '',
        description: null,
        category: null,
        country_code: 'KZ',
        venue_address: null,
        registration_starts_at: null,
        registration_ends_at: null,
        refund_policy: null,
        images: [],
        latitude: null,
        longitude: null,
        published_at: null,
      })) as unknown as EventRecord[];

      // Combine both lists and remove duplicate events.
      const allEvents = new Map<string, EventRecord>();

      [...ownEvents, ...mappedAssignedEvents].forEach((event) => {
        allEvents.set(event.id, event);
      });

      setEvents([...allEvents.values()]);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload events whenever the user returns to this screen.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Filter events by status.
  const visibleEvents =
    filter === 'ALL'
      ? events
      : events.filter((event) => event.status === filter);

  async function onRefresh() {
    setRefreshing(true);
    await load();
  }

  async function retry() {
    setLoading(true);
    await load();
  }

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  // Preserve the selected-event context used by the scanner.
  function openEvent(eventId: string) {
    selectEvent(eventId);

    router.push({
      pathname: '/events/[id]',
      params: { id: eventId },
    });
  }

  if (loading) {
    return <Busy />;
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <Page
        title="Events"
        subtitle={`Organizer dashboard${
          user?.email ? ` · ${user.email}` : ''
        }`}
      >
        <View className="px-4">
          {/* Dashboard actions */}
          <View className="mb-3 flex-row">
            <View className="flex-1">
              <Action
                label="＋ Create event"
                onPress={() => router.push('/create-event')}
              />
            </View>

            <View className="w-2" />

            <View className="flex-1">
              <Action
                label="Profile"
                kind="secondary"
                onPress={() => router.push('/profile')}
              />
            </View>
          </View>

          {/* Event status filters */}
          <View className="mb-3 flex-row flex-wrap">
            {filters.map((status) => (
              <Pressable
                key={status}
                onPress={() => setFilter(status)}
                className={`mb-2 mr-2 rounded-full px-3 py-2 ${
                  filter === status
                    ? 'bg-blue-600'
                    : 'border border-slate-200 bg-white'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    filter === status
                      ? 'text-white'
                      : 'text-slate-600'
                  }`}
                >
                  {status === 'ALL'
                    ? 'All'
                    : status.replace('_', ' ')}
                </Text>
              </Pressable>
            ))}
          </View>

          {error ? (
            <Text className="mb-3 text-red-600">
              {error}
            </Text>
          ) : null}
        </View>

        {/* Events list */}
        <FlatList
          data={visibleEvents}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: 32,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
            />
          }
          ListEmptyComponent={
            <View className="py-10">
              <Text className="text-center text-slate-500">
                {error
                  ? 'Could not load events. Please try again.'
                  : 'No events in this category.'}
              </Text>

              {error ? (
                <Pressable
                  onPress={retry}
                  className="mt-4 self-center rounded-lg bg-blue-600 px-5 py-2.5"
                >
                  <Text className="font-semibold text-white">
                    Try again
                  </Text>
                </Pressable>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => openEvent(item.id)}>
              <Card>
                <View className="flex-row items-start justify-between">
                  <Text className="mr-2 flex-1 text-lg font-bold text-slate-900">
                    {item.title}
                  </Text>

                  <Text className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                    {item.status}
                  </Text>
                </View>

                <Text className="mt-2 text-sm text-slate-500">
                  {formatDate(item.starts_at)}
                </Text>

                <Text className="mt-1 text-sm text-slate-500">
                  {[item.venue_name, item.city]
                    .filter(Boolean)
                    .join(' · ') || 'Location not set'}
                </Text>

                <Text className="mt-3 text-sm font-semibold text-blue-700">
                  Manage event →
                </Text>
              </Card>
            </Pressable>
          )}
        />

        {/* Logout */}
        <View className="px-4 pb-2">
          <Action
            label="Log out"
            kind="secondary"
            onPress={handleLogout}
          />
        </View>
      </Page>
    </SafeAreaView>
  );
}
