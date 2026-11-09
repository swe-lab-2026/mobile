import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAssignedEvents } from '../../api/events';
import { AssignedEvent } from '../../types/event';
import { useAuth } from '../../store/auth-context';
import { useSelectedEvent } from '../../store/selected-event-context';
import { SafeAreaView } from 'react-native-safe-area-context';

function formatDate(value: string) {
  const d = new Date(value);
  if(isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric'});
}

export default function EventsListScreen() {
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const { selectEvent } = useSelectedEvent();
  const [events, setEvents] = useState<AssignedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setEvents(await getAssignedEvents());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

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

  function openEvent(eventId: string) {
    selectEvent(eventId);
    router.push({pathname: '/events/[id]', params: { id: eventId }});
  }

  if (loading) {
    return (
      <View className='flex-1 items-center justify-center bg-white'>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <SafeAreaView style= {{flex:1, backgroundColor: 'white'}}>
    <View className='flex-1 bg-white p-4'>
      <View className='mb-4 flex-row items-center justify-between'>
        <Text className='text-xl font-semibold'>Your Events</Text>
        <Pressable onPress={logout} className="active:opacity-60">
          <Text className='text-sm text-red-600'>Log out</Text>
        </Pressable>
      </View>

      {error && events.length > 0 && (
          <Text className="mb-2 text-center text-sm text-red-600">
            Couldn't refresh. Pull down to try again.
          </Text>
      )}

      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          error ? (
            <View className="mt-10 items-center">
                <Text className="mb-3 text-center text-gray-500">
                  Couldn't load your events.
                </Text>
                <Pressable onPress={retry} className="rounded-lg bg-black px-5 py-2.5 active:opacity-80">
                  <Text className="font-semibold text-white">Try again</Text>
                </Pressable>
              </View>
          ) : (
            <Text className='mt-10 text-center text-gray-500'>No events assigned yet.</Text>
          )
        }
        renderItem={({ item }) => {
          const date = formatDate(item.startsAt);
          const subtitle = [date, item.location].filter(Boolean).join(' · ');
          <Pressable
            className='border-b border-gray-200 py-3.5 active:bg-gray-50'
            onPress={() => openEvent(item.id)}
          >
            <Text className='text-1xl font-medium'>{item.name}</Text>
            {subtitle ? (
              <Text className='mt-0.5 text-sm text-gray-500'>{item.location}</Text>
            ) : null}
          </Pressable>
        }}
      />
    </View>
    </SafeAreaView>
  );
}
