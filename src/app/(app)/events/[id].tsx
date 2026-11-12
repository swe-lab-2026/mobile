import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError } from '../../../api/client';
import { getEventAttendanceStats, getEventDetails } from '../../../api/events';
import { AttendanceStats, EventDetails } from '../../../types/event';
import { useSelectedEvent } from '../../../store/selected-event-context';

function formatDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatTime(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
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
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { selectEvent } = useSelectedEvent();
  const [event, setEvent] = useState<EventDetails | null>(null);
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const currentEvent = id && event?.id === id ? event : null;
  const isLoading = !!id && (loading || event?.id !== id);

  useEffect(() => {
    let active = true;

    if (!id) {
      return () => {
        active = false;
      };
    }

    getEventDetails(id)
      .then((found) => {
        if (!active) return;
        setEvent(found);
        setLoadError(null);
        setLoading(false);
        setStats(null);
        setStatsError(false);

        if (!found) return;

        selectEvent(id);
        setStatsLoading(true);
        getEventAttendanceStats(found.id)
          .then((data) => {
            if (active) setStats(data);
          })
          .catch(() => {
            if (active) setStatsError(true);
          })
          .finally(() => {
            if (active) setStatsLoading(false);
          });
      })
      .catch((error) => {
        if (!active) return;
        setEvent(null);
        setStatsError(true);
        setLoading(false);
        setLoadError(
          error instanceof ApiError && error.status === 0
            ? 'Cannot reach the server. Check your connection and try again.'
            : 'Could not load this event. Please try again.',
        );
      });

    return () => {
      active = false;
    };
  }, [id, selectEvent]);

  if (!id) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-1 items-center justify-center bg-white p-4">
          <Text className="mb-4 text-center">No event was selected.</Text>
          <Pressable onPress={() => router.back()}>
            <Text className="text-blue-600">‹ Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  if (!currentEvent) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-1 items-center justify-center bg-white p-4">
          <Text className="mb-4 text-center">
            {loadError ?? 'Event not found or you do not have access.'}
          </Text>
          <Pressable onPress={() => router.back()}>
            <Text className="text-blue-600">‹ Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const registered = stats?.totalRegistered;
  const checkedIn = stats?.totalCheckedIn;
  const progress =
    stats && stats.totalRegistered > 0
      ? Math.min(stats.totalCheckedIn / stats.totalRegistered, 1)
      : 0;
  const percent = Math.round(progress * 100);

  const date = formatDate(currentEvent.startsAt);
  const startTime = formatTime(currentEvent.startsAt);
  const endTime = formatTime(currentEvent.endsAt);
  const time = startTime && endTime ? `${startTime} – ${endTime}` : startTime;

  const rows = [
    { icon: '📅', label: 'Date', value: date },
    { icon: '🕒', label: 'Time', value: time },
    { icon: '📍', label: 'Location', value: currentEvent.location },
    { icon: '👤', label: 'Organizer', value: currentEvent.organizer },
  ];
  const visibleRows = rows.filter((row) => row.value);

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView className="flex-1 bg-white">
        <View className="p-4">
          <Pressable onPress={() => router.back()} className="mb-4 self-start active:opacity-60">
            <Text className="text-base text-blue-600">‹ Back</Text>
          </Pressable>

          <Text className="mb-5 text-xl font-semibold">{currentEvent.name}</Text>

          <View className="mb-4 flex-row gap-3">
            <View className="flex-1 items-center rounded-xl border border-gray-200 p-4">
              <Text className="text-3xl font-bold">{registered ?? '—'}</Text>
              <Text className="mt-1 text-sm text-gray-500">Registered</Text>
            </View>
            <View className="flex-1 items-center rounded-xl border border-gray-200 p-4">
              <Text className="text-3xl font-bold">{checkedIn ?? '—'}</Text>
              <Text className="mt-1 text-sm text-gray-500">Checked In</Text>
            </View>
            <View className="flex-1 items-center rounded-xl border border-gray-200 p-4">
              <Text className="text-3xl font-bold">{stats?.remaining ?? '—'}</Text>
              <Text className="mt-1 text-sm text-gray-500">Remaining</Text>
            </View>
          </View>

          <View className="mb-6">
            {statsLoading ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator size="small" />
                <Text className="text-xs text-gray-500">Loading attendance…</Text>
              </View>
            ) : stats ? (
              <>
                <View className="h-2 overflow-hidden rounded-full bg-gray-200">
                  <View className="h-2 rounded-full bg-green-500" style={{ width: `${percent}%` }} />
                </View>
                <Text className="mt-1 text-xs text-gray-500">
                  {percent}% checked in · {stats.totalCheckedIn} of {stats.totalRegistered}
                </Text>
              </>
            ) : (
              <Text className="text-xs text-gray-500">
                {statsError
                  ? 'Attendance statistics are unavailable right now.'
                  : 'No attendance data available.'}
              </Text>
            )}
          </View>

          {stats ? (
            <View className="mb-4 flex-row flex-wrap gap-2">
              <Text className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                Issued {stats.totalIssued}
              </Text>
              <Text className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                Cancelled {stats.cancelled}
              </Text>
              <Text className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                Refunded {stats.refunded}
              </Text>
            </View>
          ) : null}

          {visibleRows.length > 0 ? (
            <View className="mb-6 rounded-xl border border-gray-200 px-4">
              {visibleRows.map((row, index) => (
                <InfoRow
                  key={row.label}
                  icon={row.icon}
                  label={row.label}
                  value={row.value}
                  last={index === visibleRows.length - 1}
                />
              ))}
            </View>
          ) : null}

          <Pressable
            className="mb-3 items-center rounded-lg bg-black p-3.5 active:opacity-80"
            onPress={() =>
              router.push({ pathname: '/scanner', params: { eventId: currentEvent.id } })
            }>
            <Text className="font-semibold text-white">Open Scanner</Text>
          </Pressable>

          <Pressable
            className="items-center rounded-lg border border-gray-300 p-3.5 active:bg-gray-50"
            onPress={() =>
              router.push({
                pathname: '/events/list_of_participants',
                params: { id: currentEvent.id },
              })
            }>
            <Text className="font-semibold">Search participants</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
