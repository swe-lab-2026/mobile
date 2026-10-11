import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Pressable } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { getEventDetails } from '../../../api/events';
import { EventDetails } from '../../../types/event';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<EventDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getEventDetails(id)
      .then(setEvent)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <View className='flex-1 items-center justify-center bg-white'>
        <ActivityIndicator />
      </View>
    );
  }

  if (!event) {
    return (
      <View className='flex-1 items-center justify-center bg-white'>
        <Text>Event not found.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style= {{flex:1, backgroundColor: 'white'}}>
    <View className="flex-1 bg-white p-4">
      <Text className="mb-5 text-xl font-semibold">{event.name}</Text>

      <View className="mb-6 flex-row gap-3">
        <View className="flex-1 items-center rounded-xl border border-gray-200 p-4">
          <Text className="text-3xl font-bold">{event.registeredCount}</Text>
          <Text className="mt-1 text-sm text-gray-500">Registered</Text>
        </View>
        <View className="flex-1 items-center rounded-xl border border-gray-200 p-4">
          <Text className="text-3xl font-bold">{event.checkedInCount}</Text>
          <Text className="mt-1 text-sm text-gray-500">Checked In</Text>
        </View>
      </View>

      <Pressable
        className="items-center rounded-lg bg-black p-3.5 active:opacity-80"
        onPress={() => router.push('/scanner')}
      >
        <Text className="font-semibold text-white">Open Scanner</Text>
      </Pressable>
    </View>
    </SafeAreaView>
  );
}
