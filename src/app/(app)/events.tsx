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
import { useAuth } from '../../store/auth-context';
import { useSelectedEvent } from '../../store/selected-event-context';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function EventsListScreen() {
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const { selectEvent } = useSelectedEvent();
  const [events, setEvents] = useState<AssignedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = await getAssignedEvents();
    setEvents(data);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function openEvent(eventId: string) {
    selectEvent(eventId);
    router.push(`/events/${eventId}`);
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

      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <Text className='mt-10 text-center text-gray-500'>No events assigned yet.</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            className='border-b border-gray-200 py-3.5 active:bg-gray-50'
            onPress={() => openEvent(item.id)}
          >
            <Text className='text-1xl font-medium'>{item.name}</Text>
            {item.location && (
              <Text className='mt-0.5 text-sm text-gray-500'>{item.location}</Text>
            )}
          </Pressable>
        )}
      />
    </View>
    </SafeAreaView>
  );
}

