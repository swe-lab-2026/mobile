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
import { AssignedEvent } from '../../types/event';

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
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <View>
          <Text style={styles.subtitle}>Welcome back</Text>
          <Text style={styles.title}>Your Events</Text>
        </View>
        <Pressable
          onPress={logout}
          style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed]}
        >
          <Text style={styles.logout}>Log out</Text>
        </Pressable>
      </View>

      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4f46e5" />
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No events yet</Text>
            <Text style={styles.empty}>Events assigned to you will show up here.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            onPress={() => openEvent(item.id)}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.name?.charAt(0).toUpperCase()}</Text>
            </View>

            <View style={styles.cardBody}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.name}
              </Text>
              {item.location ? (
                <Text style={styles.rowSubtitle} numberOfLines={1}>
                  {item.location}
                </Text>
              ) : null}
            </View>

            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  subtitle: { fontSize: 13, color: '#6b7280', marginBottom: 2 },
  title: { fontSize: 26, fontWeight: '700', color: '#111827' },
  logoutButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#fee2e2',
  },
  logout: { color: '#dc2626', fontSize: 14, fontWeight: '600' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  pressed: { opacity: 0.7 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#eef2ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#4f46e5' },
  cardBody: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  rowSubtitle: { fontSize: 13, color: '#6b7280', marginTop: 3 },
  chevron: { fontSize: 26, color: '#c4c7d0', marginLeft: 8 },
  emptyBox: { alignItems: 'center', marginTop: 80 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#111827', marginBottom: 6 },
  empty: { textAlign: 'center', color: '#6b7280', fontSize: 14 },
});