import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    Pressable,
    RefreshControl,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    checkInParticipant,
    getParticipants,
    undoCheckInParticipant,
} from '../../../api/events';
import { Participant } from '../../../types/event';

type Filter = 'all' | 'checkedIn' | 'notCheckedIn';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'checkedIn', label: 'Checked in' },
  { key: 'notCheckedIn', label: 'Not yet' },
];

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

function formatCheckInTime(value?: string) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function ParticipantsScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Participant | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await getParticipants(id);
      setParticipants(data);
    } catch {
      Alert.alert('Error', 'Could not load participants.');
    }
  }, [id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const checkedInCount = participants.filter((p) => p.checkedIn).length;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return participants.filter((p) => {
      if (filter === 'checkedIn' && !p.checkedIn) return false;
      if (filter === 'notCheckedIn' && p.checkedIn) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.email ?? '').toLowerCase().includes(q)
      );
    });
  }, [participants, search, filter]);

  async function toggleCheckIn(p: Participant) {
    if (!id) return;
    setBusy(true);
    try {
      if (p.checkedIn) {
        await undoCheckInParticipant(id, p.id);
      } else {
        await checkInParticipant(id, p.id);
      }
      setParticipants((prev) =>
        prev.map((x) =>
          x.id === p.id
            ? {
                ...x,
                checkedIn: !p.checkedIn,
                checkedInAt: !p.checkedIn ? new Date().toISOString() : undefined,
              }
            : x
        )
      );
      setSelected(null);
    } catch {
      Alert.alert('Error', 'Could not update check-in. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function confirmUndo(p: Participant) {
    Alert.alert('Undo check-in?', `${p.name} will be marked as not checked in.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Undo', style: 'destructive', onPress: () => toggleCheckIn(p) },
    ]);
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

      <Pressable
        onPress={() => router.back()}
        style={({ pressed }) => [styles.backPill, pressed && styles.pressed]}
      >
        <Text style={styles.backText}>‹ Back</Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.subtitle}>
          {checkedInCount} of {participants.length} checked in
        </Text>
        <Text style={styles.title}>Participants</Text>
      </View>

      <TextInput
        style={styles.search}
        placeholder="Search by name or email"
        placeholderTextColor="#9ca3af"
        value={search}
        onChangeText={setSearch}
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
      />

      <View style={styles.filters}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.filterChip, active && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4f46e5" />
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No participants found</Text>
            <Text style={styles.empty}>Try a different search or filter.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            onPress={() => setSelected(item)}
          >
            <View style={[styles.avatar, item.checkedIn && styles.avatarDone]}>
              <Text style={[styles.avatarText, item.checkedIn && styles.avatarTextDone]}>
                {initials(item.name)}
              </Text>
            </View>

            <View style={styles.cardBody}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.name}
              </Text>
              {item.email || item.ticketType ? (
                <Text style={styles.rowSubtitle} numberOfLines={1}>
                  {[item.ticketType, item.email].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </View>

            <View style={[styles.badge, item.checkedIn ? styles.badgeDone : styles.badgePending]}>
              <Text
                style={[styles.badgeText, item.checkedIn ? styles.badgeTextDone : styles.badgeTextPending]}
              >
                {item.checkedIn ? 'Checked in' : 'Not yet'}
              </Text>
            </View>
          </Pressable>
        )}
      />

      {/* Action sheet */}
      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => !busy && setSelected(null)}>
          <Pressable
            style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}
            onPress={() => {}}
          >
            <View style={styles.sheetHandle} />

            {selected && (
              <>
                <View style={styles.sheetHeader}>
                  <View style={[styles.avatar, selected.checkedIn && styles.avatarDone]}>
                    <Text style={[styles.avatarText, selected.checkedIn && styles.avatarTextDone]}>
                      {initials(selected.name)}
                    </Text>
                  </View>
                  <View style={styles.cardBody}>
                    <Text style={styles.sheetName}>{selected.name}</Text>
                    {selected.email ? (
                      <Text style={styles.rowSubtitle}>{selected.email}</Text>
                    ) : null}
                    {selected.ticketType ? (
                      <Text style={styles.rowSubtitle}>{selected.ticketType}</Text>
                    ) : null}
                  </View>
                </View>

                <Text style={styles.sheetStatus}>
                  {selected.checkedIn
                    ? `Checked in${
                        formatCheckInTime(selected.checkedInAt)
                          ? ` at ${formatCheckInTime(selected.checkedInAt)}`
                          : ''
                      }`
                    : 'Not checked in yet'}
                </Text>

                {selected.checkedIn ? (
                  <Pressable
                    disabled={busy}
                    onPress={() => confirmUndo(selected)}
                    style={({ pressed }) => [
                      styles.actionButton,
                      styles.undoButton,
                      (pressed || busy) && styles.pressed,
                    ]}
                  >
                    {busy ? (
                      <ActivityIndicator color="#dc2626" />
                    ) : (
                      <Text style={styles.undoText}>Undo check-in</Text>
                    )}
                  </Pressable>
                ) : (
                  <Pressable
                    disabled={busy}
                    onPress={() => toggleCheckIn(selected)}
                    style={({ pressed }) => [
                      styles.actionButton,
                      styles.checkInButton,
                      (pressed || busy) && styles.pressed,
                    ]}
                  >
                    {busy ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.checkInText}>Check in manually</Text>
                    )}
                  </Pressable>
                )}

                <Pressable
                  disabled={busy}
                  onPress={() => setSelected(null)}
                  style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
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
  container: { flex: 1, paddingHorizontal: 20, backgroundColor: '#f6f7fb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f6f7fb' },
  pressed: { opacity: 0.7 },

  backPill: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#eef2ff',
    marginBottom: 16,
  },
  backText: { color: '#4f46e5', fontSize: 14, fontWeight: '600' },

  header: { marginBottom: 16 },
  subtitle: { fontSize: 13, color: '#6b7280', marginBottom: 2 },
  title: { fontSize: 26, fontWeight: '700', color: '#111827' },

  search: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#111827',
    marginBottom: 12,
    ...shadow,
  },

  filters: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  filterChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#fff',
  },
  filterChipActive: { backgroundColor: '#4f46e5' },
  filterText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  filterTextActive: { color: '#fff' },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    ...shadow,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarDone: { backgroundColor: '#dcfce7' },
  avatarText: { fontSize: 15, fontWeight: '700', color: '#6b7280' },
  avatarTextDone: { color: '#16a34a' },
  cardBody: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  rowSubtitle: { fontSize: 13, color: '#6b7280', marginTop: 3 },

  badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, marginLeft: 8 },
  badgeDone: { backgroundColor: '#dcfce7' },
  badgePending: { backgroundColor: '#f3f4f6' },
  badgeText: { fontSize: 12, fontWeight: '600' },
  badgeTextDone: { color: '#16a34a' },
  badgeTextPending: { color: '#6b7280' },

  emptyBox: { alignItems: 'center', marginTop: 60 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#111827', marginBottom: 6 },
  empty: { textAlign: 'center', color: '#6b7280', fontSize: 14 },

  backdrop: { flex: 1, backgroundColor: 'rgba(17,24,39,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e5e7eb',
    marginBottom: 20,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  sheetName: { fontSize: 18, fontWeight: '700', color: '#111827' },
  sheetStatus: { fontSize: 14, color: '#6b7280', marginBottom: 20 },

  actionButton: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  checkInButton: { backgroundColor: '#4f46e5' },
  checkInText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  undoButton: { backgroundColor: '#fee2e2' },
  undoText: { color: '#dc2626', fontSize: 16, fontWeight: '700' },
  cancelButton: { paddingVertical: 14, alignItems: 'center' },
  cancelText: { color: '#6b7280', fontSize: 15, fontWeight: '600' },
});