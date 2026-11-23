import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CatalogEvent, getCatalogEvents } from '../../api/events';
import { AppHeader } from '../../components/AppHeader';
import { BRAND } from '../../components/Logo';
import { useLanguage } from '../../store/language-context';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export default function CatalogScreen() {
  const { t } = useLanguage();

  const [events, setEvents] = useState<CatalogEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    try {
      setEvents(await getCatalogEvents());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

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

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e) =>
      [e.title, e.venueName, e.city].filter(Boolean).join(' ').toLowerCase().includes(q)
    );
  }, [events, query]);

  function renderItem({ item }: { item: CatalogEvent }) {
    const d = new Date(item.startsAt);
    const valid = !isNaN(d.getTime());
    const place = [item.venueName, item.city].filter(Boolean).join(', ');

    return (
      <View style={styles.card}>
        <View style={styles.dateBox}>
          <Text style={styles.dateDay}>{valid ? d.getDate() : '–'}</Text>
          <Text style={styles.dateMonth}>{valid ? t.months[d.getMonth()] : ''}</Text>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.title}
          </Text>
          {valid ? (
            <Text style={styles.cardMeta}>
              {t.days[d.getDay()]} {pad(d.getHours())}:{pad(d.getMinutes())}
            </Text>
          ) : null}
          {place ? (
            <Text style={styles.cardMeta} numberOfLines={1}>
              {place}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <AppHeader />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={BRAND} />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND} />
          }
          ListHeaderComponent={
            <View>
              <Text style={styles.title}>{t.title}</Text>
              <Text style={styles.subtitle}>{t.subtitle}</Text>
              <TextInput
                style={styles.search}
                placeholder={t.search}
                placeholderTextColor="#6b7280"
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
            </View>
          }
          ListEmptyComponent={
            error ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>{t.error}</Text>
                <Pressable onPress={retry} style={styles.retryButton}>
                  <Text style={styles.retryText}>{t.retry}</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>{query ? t.noResults : t.empty}</Text>
              </View>
            )
          }
          ListFooterComponent={<Text style={styles.footer}>© 2026 BiletFlow · CSCI 361</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3f4f6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  listContent: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 24 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, color: '#111827' },
  subtitle: { marginTop: 8, fontSize: 14, color: '#4b5563', lineHeight: 20 },
  search: {
    marginTop: 20,
    marginBottom: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#111827',
  },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 12,
  },
  dateBox: {
    width: 60,
    height: 64,
    borderRadius: 14,
    backgroundColor: '#e8f3ec',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  dateDay: { fontSize: 22, fontWeight: '800', color: '#166534' },
  dateMonth: { fontSize: 11, fontWeight: '800', color: '#166534', marginTop: 1 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 4 },
  cardMeta: { fontSize: 14, color: '#6b7280', marginTop: 2 },

  emptyBox: { alignItems: 'center', marginTop: 40, gap: 12 },
  emptyText: { fontSize: 15, color: '#6b7280', textAlign: 'center' },
  retryButton: { paddingVertical: 11, paddingHorizontal: 20, borderRadius: 12, backgroundColor: '#111' },
  retryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  footer: { textAlign: 'center', fontSize: 12, color: '#6b7280', marginTop: 32 },
});