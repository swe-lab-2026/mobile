import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Pressable } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { getEventDetails } from '../../../api/events';
import { EventDetails } from '../../../types/event';

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
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.center}>
        <Text>Event not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{event.name}</Text>

      <View style={styles.counters}>
        <View style={styles.counterBox}>
          <Text style={styles.counterValue}>{event.registeredCount}</Text>
          <Text style={styles.counterLabel}>Registered</Text>
        </View>
        
        <View style={styles.counterBox}>
          <Text style={styles.counterValue}>{event.checkedInCount}</Text>
          <Text style={styles.counterLabel}>Checked In</Text>
        </View>
      </View>

      <Pressable style={styles.scanButton} onPress={() => router.push('/scanner')}>
        <Text style={styles.scanButtonText}>Open Scanner</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 20 },
  counters: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  counterBox: { flex: 1, borderWidth: 1, borderColor: 'gray', borderRadius: 10, padding: 16, alignItems: 'center' },
  counterValue: { fontSize: 28, fontWeight: '700' },
  counterLabel: { fontSize: 13, color: 'gray', marginTop: 4 },
  scanButton: { backgroundColor: 'black', borderRadius: 8, padding: 14, alignItems: 'center' },
  scanButtonText: { color: 'white', fontWeight: '600' },
});
