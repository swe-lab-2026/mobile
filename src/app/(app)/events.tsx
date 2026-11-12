import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError } from '../../api/client';
import { getAssignedEvents } from '../../api/events';
import { AssignedEvent } from '../../types/event';
import { useAuth } from '../../store/auth-context';
import { useSelectedEvent } from '../../store/selected-event-context';

function formatDate(value: string) {
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'NETWORK_ERROR') {
      return 'Cannot reach the server. Check your connection.';
    }
    return error.message;
  }
  return 'Could not load your events.';
}

export default function EventsListScreen() {
  const { logout, user } = useAuth();
  const { selectEvent } = useSelectedEvent();
  const [events, setEvents] = useState<AssignedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getAssignedEvents();
      setEvents(data);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    let active = true;

    getAssignedEvents()
      .then((data) => {
        if (!active) return;
        setEvents(data);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(errorMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user?.userId]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function retry() {
    setLoading(true);
    await load();
    setLoading(false);
  }

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  function openEvent(eventId: string) {
    selectEvent(eventId);
    router.push({ pathname: '/events/[id]', params: { id: eventId } });
  }

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 bg-white p-4">
        <View className="mb-4 flex-row items-center justify-between">
          <Text className="text-xl font-semibold">Your Events</Text>
          <Pressable onPress={handleLogout} className="active:opacity-60">
            <Text className="text-sm text-red-600">Log out</Text>
          </Pressable>
        </View>

        {error && events.length > 0 ? (
          <Text className="mb-2 text-center text-sm text-red-600">
            {error} Pull down to try again.
          </Text>
        ) : null}

        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            error ? (
              <View className="mt-10 items-center">
                <Text className="mb-3 text-center text-gray-500">{error}</Text>
                <Pressable
                  onPress={retry}
                  className="rounded-lg bg-black px-5 py-2.5 active:opacity-80">
                  <Text className="font-semibold text-white">Try again</Text>
                </Pressable>
              </View>
            ) : (
              <Text className="mt-10 text-center text-gray-500">
                No events are assigned to your account yet.
              </Text>
            )
          }
          renderItem={({ item }) => {
            const date = formatDate(item.startsAt);
            const subtitle = [date, item.location].filter(Boolean).join(' · ');

            return (
              <Pressable
                className="border-b border-gray-200 py-3.5 active:bg-gray-50"
                onPress={() => openEvent(item.id)}>
                <Text className="text-lg font-medium">{item.name}</Text>
                {subtitle ? (
                  <Text className="mt-0.5 text-sm text-gray-500">{subtitle}</Text>
                ) : null}
              </Pressable>
            );
          }}
        />
      </View>
    </SafeAreaView>
  );
}
