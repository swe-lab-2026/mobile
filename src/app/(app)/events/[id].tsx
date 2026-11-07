import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getEventDetails } from '../../../api/events';
import { EventDetails } from '../../../types/event';
import { SafeAreaView } from 'react-native-safe-area-context';

function formatDate(value?: string) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatTime(value?: string) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

type InfoRowProps = {
  icon: string;
  label: string;
  value?: string | null;
  last?: boolean;
};

function InfoRow({ icon, label, value, last }: InfoRowProps) {
  if (!value) return null;
  return (
    <View className={`flex-row items-center py-3 ${last ? '' : 'border-b border-gray-100'}`}>
      <Text className="mr-3 text-xl">{icon}</Text>
      <View className="flex-1">
        <Text className="text-xs uppercase text-gray-500">{label}</Text>
        <Text className="text-base text-gray-900">{value}</Text>
      </View>
    </View>
  );
}

export default function EventDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<EventDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getEventDetails(id)
      .then(setEvent)
      .catch(() => setEvent(null))
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
      <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }}>
        <View className="flex-1 items-center justify-center bg-white p-4">
          <Text className="mb-4">Event not found.</Text>
          <Pressable onPress={() => router.back()}>
            <Text className="text-blue-600">‹ Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const registered = event.registeredCount ?? 0;
  const checkedIn = event.checkedInCount ?? 0;
  const progress = registered > 0 ? Math.min(checkedIn / registered, 1) : 0;
  const percent = Math.round(progress * 100);

  const date = formatDate(event.startsAt);
  const startTime = formatTime(event.startsAt);
  const endTime = formatTime(event.endsAt);
  const time = startTime && endTime ? `${startTime} – ${endTime}` : startTime;

  const rows = [
    { icon: '📅', label: 'Date', value: date },
    { icon: '🕒', label: 'Time', value: time },
    { icon: '📍', label: 'Location', value: event.location },
    { icon: '👤', label: 'Organizer', value: event.organizer },
  ];
  const visibleRows = rows.filter((r) => r.value);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }}>
      <ScrollView className="flex-1 bg-white">
        <View className="p-4">
          <Pressable onPress={() => router.back()} className="mb-4 self-start active:opacity-60">
            <Text className="text-base text-blue-600">‹ Back</Text>
          </Pressable>

          <Text className="mb-5 text-xl font-semibold">{event.name}</Text>

          <View className="mb-4 flex-row gap-3">
            <View className="flex-1 items-center rounded-xl border border-gray-200 p-4">
              <Text className="text-3xl font-bold">{registered}</Text>
              <Text className="mt-1 text-sm text-gray-500">Registered</Text>
            </View>
            <View className="flex-1 items-center rounded-xl border border-gray-200 p-4">
              <Text className="text-3xl font-bold">{checkedIn}</Text>
              <Text className="mt-1 text-sm text-gray-500">Checked In</Text>
            </View>
          </View>

          <View className="mb-6">
            <View className="h-2 overflow-hidden rounded-full bg-gray-200">
              <View className="h-2 rounded-full bg-green-500" style={{ width: `${percent}%` }} />
            </View>
            <Text className="mt-1 text-xs text-gray-500">{percent}% checked in</Text>
          </View>

          {rows.length > 0 && (
            <View className="mb-6 rounded-xl border border-gray-200 px-4">
              {rows.map((r, i) => (
                <InfoRow
                  key={r.label}
                  icon={r.icon}
                  label={r.label}
                  value={r.value}
                  last={i === rows.length - 1}
                />
              ))}
            </View>
          )}

          <Pressable
            className="mb-3 items-center rounded-lg bg-black p-3.5 active:opacity-80"
            onPress={() => router.push('/scanner')}
          >
            <Text className="font-semibold text-white">Open Scanner</Text>
          </Pressable>

          <Pressable
            className="items-center rounded-lg border border-gray-300 p-3.5 active:bg-gray-50"
            onPress={() =>
              router.push({ pathname: '../events/list_of_participants', params: { id } })
            }
          >
            <Text className="font-semibold">View participants</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
