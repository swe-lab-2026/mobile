import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getEventDetails } from '../../../api/events';
import { EventDetails } from '../../../types/event';

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
      <View className="mr-3 h-10 w-10 items-center justify-center rounded-xl bg-indigo-50">
        <Text className="text-lg">{icon}</Text>
      </View>
      <View className="flex-1">
        <Text className="mb-0.5 text-xs text-gray-500">{label}</Text>
        <Text className="text-[15px] font-medium text-gray-900">{value}</Text>
      </View>
    </View>
  );
}

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
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  if (!event) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <Text>Event not found.</Text>
      </View>
    );
  }

  const registered = event.registeredCount ?? 0;
  const checkedIn = event.checkedInCount ?? 0;
  const progress = registered > 0 ? Math.min(checkedIn / registered, 1) : 0;
  const percent = Math.round(progress * 100);

  const date = formatDate(event.startDate);
  const startTime = formatTime(event.startDate);
  const endTime = formatTime(event.endDate);
  const time = startTime && endTime ? `${startTime} – ${endTime}` : startTime;

  const rows = [
    { icon: '📅', label: 'Date', value: date },
    { icon: '🕒', label: 'Time', value: time },
    { icon: '📍', label: 'Location', value: event.location },
    { icon: '👤', label: 'Organizer', value: event.organizer },
  ];
  const visibleRows = rows.filter((r) => r.value);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f6f7fb' }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          onPress={() => router.back()}
          className="mb-5 self-start rounded-full bg-indigo-50 px-3.5 py-2 active:opacity-70"
        >
          <Text className="text-sm font-semibold text-indigo-600">‹ Back</Text>
        </Pressable>

        <Text className="mb-0.5 text-[13px] text-gray-500">Event</Text>
        <Text className="mb-5 text-[26px] font-bold text-gray-900">{event.name}</Text>

        {(visibleRows.length > 0 || event.description) && (
          <View className="mb-4 rounded-2xl bg-white p-4 shadow-sm">
            <Text className="mb-1.5 text-base font-bold text-gray-900">About this event</Text>

            {visibleRows.map((row, index) => (
              <InfoRow
                key={row.label}
                icon={row.icon}
                label={row.label}
                value={row.value}
                last={index === visibleRows.length - 1 && !event.description}
              />
            ))}

            {event.description ? (
              <Text className="mt-2 border-t border-gray-100 pt-3 text-sm leading-5 text-gray-600">
                {event.description}
              </Text>
            ) : null}
          </View>
        )}

        <View className="mb-4 flex-row gap-3">
          <View className="flex-1 items-center rounded-2xl bg-white py-5 shadow-sm">
            <Text className="text-3xl font-bold text-gray-900">{registered}</Text>
            <Text className="mt-1 text-[13px] text-gray-500">Registered</Text>
          </View>
          <View className="flex-1 items-center rounded-2xl bg-white py-5 shadow-sm">
            <Text className="text-3xl font-bold text-indigo-600">{checkedIn}</Text>
            <Text className="mt-1 text-[13px] text-gray-500">Checked in</Text>
          </View>
        </View>

        <View className="rounded-2xl bg-white p-4 shadow-sm">
          <View className="mb-2.5 flex-row justify-between">
            <Text className="text-sm font-medium text-gray-700">Check-in progress</Text>
            <Text className="text-sm font-bold text-indigo-600">{percent}%</Text>
          </View>
          <View className="h-2 overflow-hidden rounded bg-indigo-50">
            <View className="h-full rounded bg-indigo-600" style={{ width: `${percent}%` }} />
          </View>
        </View>
      </ScrollView>

      <View className="bg-[#f6f7fb] px-5 pb-4 pt-3">
        <Pressable
          className="mb-2.5 items-center rounded-2xl bg-indigo-50 py-4 active:opacity-70"
          onPress={() => router.push(`/events/${id}/participants`)}
        >
          <Text className="text-base font-bold text-indigo-600">View Participants</Text>
        </Pressable>

        <Pressable
  className="items-center rounded-2xl bg-indigo-600 py-4 active:opacity-80"
  onPress={() => router.push({ pathname: '/scanner', params: { eventId: id } })}
>
  <Text className="text-base font-bold text-white">Open Scanner</Text>
</Pressable>
      </View>
    </SafeAreaView>
  );
}