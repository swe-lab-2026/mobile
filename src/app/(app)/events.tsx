import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getAssignedEvents } from '../../api/events';
import { organizerEvents } from '../../api/organizer';
import { AppHeader } from '../../components/AppHeader';
import { colors, shadow } from '../../constants/theme';
import { useLanguage } from '../../store/language-context';
import { useSelectedEvent } from '../../store/selected-event-context';
import { AssignedEvent } from '../../types/event';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

const STATUS_FILTERS = ['ALL', 'DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'COMPLETED', 'CANCELLED'];

// Organizer-owned events plus events the user is assigned to as an admin.
// Owned events win on duplicates because they carry the real status.
async function loadAllEvents(): Promise<AssignedEvent[]> {
  const [owned, assigned] = await Promise.all([
    organizerEvents.list().catch(() => []),
    getAssignedEvents(),
  ]);
  const byId = new Map<string, AssignedEvent>();
  for (const e of assigned) byId.set(e.id, e);
  for (const e of owned) {
    byId.set(e.id, {
      id: e.id,
      name: e.title,
      startsAt: e.starts_at,
      endsAt: e.ends_at ?? undefined,
      location: e.venue_name ?? undefined,
      status: e.status,
      timezone: e.timezone ?? undefined,
    });
  }
  return [...byId.values()];
}

export default function EventsListScreen() {
  const { t } = useLanguage();
  const { selectEvent } = useSelectedEvent();

  const [events, setEvents] = useState<AssignedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState('ALL');

  const load = useCallback(async () => {
    try {
      setEvents(await loadAllEvents());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  // Reload whenever the screen regains focus (e.g. after creating an event).
  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadAllEvents()
        .then((data) => {
          if (!active) return;
          setEvents(data);
          setError(false);
        })
        .catch(() => {
          if (active) setError(true);
        })
        .finally(() => {
          if (active) setLoading(false);
        });

      return () => {
        active = false;
      };
    }, []),
  );

  const visibleEvents = filter === 'ALL' ? events : events.filter((e) => e.status === filter);

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
    router.push({ pathname: '/events/[id]', params: { id: eventId } });
  }

  function renderItem({ item }: { item: AssignedEvent }) {
    const d = new Date(item.startsAt);
    const valid = !isNaN(d.getTime());

    return (
      <TouchableOpacity activeOpacity={0.8} onPress={() => openEvent(item.id)} style={styles.card}>
        <View style={styles.dateBox}>
          <Text style={styles.dateDay}>{valid ? d.getDate() : '–'}</Text>
          <Text style={styles.dateMonth}>{valid ? t.months[d.getMonth()] : ''}</Text>
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.name}
          </Text>
          {valid ? (
            <Text style={styles.cardMeta}>
              {t.days[d.getDay()]} {pad(d.getHours())}:{pad(d.getMinutes())}
            </Text>
          ) : null}
          {item.location ? (
            <Text style={styles.cardMeta} numberOfLines={1}>
              {item.location}
            </Text>
          ) : null}
          {item.status ? <Text style={styles.statusBadge}>{item.status}</Text> : null}
        </View>

        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <AppHeader />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : (
        <FlatList
          data={visibleEvents}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
          }
          ListHeaderComponent={
            <View style={styles.hero}>
              <Text style={styles.title}>{t.navMyEvents}</Text>
              <Text style={styles.subtitle}>{t.myEventsSubtitle}</Text>
              {error && events.length > 0 ? (
                <Text style={styles.errorNote}>{t.error}</Text>
              ) : null}

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => router.push('/create-event')}
                style={styles.createButton}>
                <Text style={styles.createText}>+ {t.createEvent}</Text>
              </TouchableOpacity>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterRow}>
                {STATUS_FILTERS.map((f) => (
                  <TouchableOpacity
                    key={f}
                    activeOpacity={0.8}
                    onPress={() => setFilter(f)}
                    style={[styles.filterChip, filter === f && styles.filterChipActive]}>
                    <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                      {f === 'ALL' ? t.all : f}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>{error ? t.error : t.empty}</Text>
              {error ? (
                <TouchableOpacity activeOpacity={0.8} onPress={retry} style={styles.retryButton}>
                  <Text style={styles.retryText}>{t.retry}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },

  hero: { paddingTop: 28, paddingBottom: 20 },
  title: { fontSize: 30, fontWeight: '800', letterSpacing: -0.8, color: colors.ink },
  subtitle: { marginTop: 8, fontSize: 15, lineHeight: 22, color: colors.muted },
  errorNote: { marginTop: 12, fontSize: 14, color: colors.danger },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#eef0f3',
    ...shadow,
  },
  dateBox: {
    width: 64,
    height: 72,
    borderRadius: 16,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  dateDay: { fontSize: 26, fontWeight: '800', color: colors.brandDark, lineHeight: 30 },
  dateMonth: { fontSize: 11, fontWeight: '800', color: colors.brandDark, letterSpacing: 0.6 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, lineHeight: 22, marginBottom: 4 },
  cardMeta: { fontSize: 14, color: colors.muted, marginTop: 2 },
  arrow: { fontSize: 26, color: '#c4c8cf', marginLeft: 8 },
  statusBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.bg,
    fontSize: 11,
    fontWeight: '700',
    color: colors.text,
    overflow: 'hidden',
  },

  createButton: {
    marginTop: 16,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  filterRow: { gap: 8, paddingTop: 14 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  filterChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  filterText: { fontSize: 12, fontWeight: '700', color: colors.text },
  filterTextActive: { color: '#fff' },

  emptyBox: { alignItems: 'center', marginTop: 48, paddingHorizontal: 24 },
  emptyText: { fontSize: 16, color: colors.muted, textAlign: 'center', lineHeight: 22 },
  retryButton: {
    marginTop: 18,
    height: 46,
    paddingHorizontal: 24,
    borderRadius: 14,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
