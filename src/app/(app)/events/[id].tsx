import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
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
    <View style={[styles.infoRow, !last && styles.infoRowDivider]}>
      <View style={styles.infoIcon}>
        <Text style={styles.infoEmoji}>{icon}</Text>
      </View>
      <View style={styles.infoBody}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
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
