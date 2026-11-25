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
import { describeError } from '../../api/errors';
import { getAssignedEvents } from '../../api/events';
import { AppHeader } from '../../components/AppHeader';
import { colors, shadow } from '../../constants/theme';
import { useLanguage } from '../../store/language-context';
import { useSelectedEvent } from '../../store/selected-event-context';
import { AssignedEvent } from '../../types/event';

/** Day, month index, weekday and HH:MM of an instant in the event's timezone. */
function zonedParts(iso: string, timeZone?: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(d);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return {
      day: Number(get('day')),
      month: Number(get('month')) - 1,
      weekday: weekdays.indexOf(get('weekday')),
      time: `${get('hour')}:${get('minute')}`,
    };
  } catch {
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      day: d.getDate(),
      month: d.getMonth(),
      weekday: d.getDay(),
      time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    };
  }
}

const STATUS_FILTERS = ['ALL', 'DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'COMPLETED', 'CANCELLED'];

export default function EventsListScreen() {
  const { t } = useLanguage();
  const { selectEvent } = useSelectedEvent();

  const [events, setEvents] = useState<AssignedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('ALL');

  // /events/assigned is the single source: it already includes owned events,
  // so every listed event can be opened and scanned.
  const load = useCallback(async () => {
    try {
      setEvents(await getAssignedEvents());
      setError(null);
    } catch (e) {
      setError(describeError(e, t));
    }
  }, [t]);

  // Reload whenever the screen regains focus (e.g. after creating an event).
  useFocusEffect(
    useCallback(() => {
      let active = true;
      getAssignedEvents()
        .then((data) => {
          if (!active) return;
          setEvents(data);
          setError(null);
        })
        .catch((e) => {
          if (active) setError(describeError(e, t));
        })
        .finally(() => {
          if (active) setLoading(false);
        });

      return () => {
        active = false;
      };
    }, [t]),
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
    const parts = zonedParts(item.startsAt, item.timezone);

    return (
      <TouchableOpacity activeOpacity={0.8} onPress={() => openEvent(item.id)} style={styles.card}>
        <View style={styles.dateBox}>
          <Text style={styles.dateDay}>{parts ? parts.day : '–'}</Text>
          <Text style={styles.dateMonth}>{parts ? t.months[parts.month] : ''}</Text>
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.name}
          </Text>
          {parts ? (
            <Text style={styles.cardMeta}>
              {parts.weekday >= 0 ? `${t.days[parts.weekday]} ` : ''}
              {parts.time}
            </Text>
          ) : null}
          {item.location ? (
            <Text style={styles.cardMeta} numberOfLines={1}>
              {item.location}
            </Text>
          ) : null}
          {item.status ? (
            <Text style={styles.statusBadge}>{t.eventStatus[item.status] ?? item.status}</Text>
          ) : null}
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
                <Text style={styles.errorNote}>{error}</Text>
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
                      {f === 'ALL' ? t.all : t.eventStatus[f] ?? f}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>{error ?? t.empty}</Text>
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
