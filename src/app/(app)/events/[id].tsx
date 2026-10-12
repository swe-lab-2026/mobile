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
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFoundTitle}>Event not found</Text>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backPill, pressed && styles.pressed]}
        >
          <Text style={styles.backText}>Go back</Text>
        </Pressable>
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
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backPill, pressed && styles.pressed]}
        >
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.subtitle}>Event</Text>
          <Text style={styles.title}>{event.name}</Text>
        </View>

        {(visibleRows.length > 0 || event.description) && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>About this event</Text>

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
              <Text style={styles.description}>{event.description}</Text>
            ) : null}
          </View>
        )}

        <View style={styles.counters}>
          <View style={styles.counterBox}>
            <Text style={styles.counterValue}>{registered}</Text>
            <Text style={styles.counterLabel}>Registered</Text>
          </View>

          <View style={styles.counterBox}>
            <Text style={[styles.counterValue, styles.accent]}>{checkedIn}</Text>
            <Text style={styles.counterLabel}>Checked in</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>Check-in progress</Text>
            <Text style={styles.progressPercent}>{percent}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${percent}%` }]} />
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          onPress={() => router.push(`/events/list_of_participants`)}
        >
          <Text style={styles.secondaryButtonText}>View Participants</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.scanButton, pressed && styles.pressed]}
          onPress={() => router.push('/scanner')}
        >
          <Text style={styles.scanButtonText}>Open Scanner</Text>
        </Pressable>
      </View>
    </View>
  );
}



const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    backgroundColor: '#f6f7fb',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f6f7fb',
  },
  scrollContent: { paddingBottom: 16 },
  pressed: { opacity: 0.7 },

  backPill: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#eef2ff',
    marginBottom: 20,
  },
  backText: { color: '#4f46e5', fontSize: 14, fontWeight: '600' },

  header: { marginBottom: 20 },
  subtitle: { fontSize: 13, color: '#6b7280', marginBottom: 2 },
  title: { fontSize: 26, fontWeight: '700', color: '#111827' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    ...shadow,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 6 },

  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  infoRowDivider: { borderBottomWidth: 1, borderBottomColor: '#f0f1f5' },
  infoIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#eef2ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  infoEmoji: { fontSize: 18 },
  infoBody: { flex: 1 },
  infoLabel: { fontSize: 12, color: '#6b7280', marginBottom: 2 },
  infoValue: { fontSize: 15, color: '#111827', fontWeight: '500' },

  description: {
    fontSize: 14,
    lineHeight: 20,
    color: '#4b5563',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f1f5',
  },

  secondaryButton: {
  backgroundColor: '#eef2ff',
  borderRadius: 14,
  paddingVertical: 16,
  alignItems: 'center',
  marginBottom: 10,
  },
  secondaryButtonText: { color: '#4f46e5', fontSize: 16, fontWeight: '700' },

  counters: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  counterBox: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 20,
    alignItems: 'center',
    ...shadow,
  },
  counterValue: { fontSize: 32, fontWeight: '700', color: '#111827' },
  accent: { color: '#4f46e5' },
  counterLabel: { fontSize: 13, color: '#6b7280', marginTop: 4 },

  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  progressLabel: { fontSize: 14, color: '#374151', fontWeight: '500' },
  progressPercent: { fontSize: 14, color: '#4f46e5', fontWeight: '700' },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#eef2ff',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: '#4f46e5' },

  footer: { paddingTop: 12, backgroundColor: '#f6f7fb' },
  scanButton: {
    backgroundColor: '#4f46e5',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#4f46e5',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  scanButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  notFoundTitle: { fontSize: 17, fontWeight: '600', color: '#111827', marginBottom: 16 },
});