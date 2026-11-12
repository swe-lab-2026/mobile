import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '../../../api/client';
import {
  getEventAttendanceStats,
  manualCheckInTicket,
  reverseCheckInTicket,
  searchEventTickets,
} from '../../../api/events';
import { AttendanceStats, EventTicket } from '../../../types/event';

function initials(name?: string | null) {
  return (
    (name ?? '?')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('') || '?'
  );
}

function formatCheckInTime(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function statusLabel(status: string) {
  switch (status) {
    case 'VALID':
      return 'Not checked in';
    case 'CHECKED_IN':
      return 'Checked in';
    case 'CANCELLED':
      return 'Cancelled';
    case 'REFUNDED':
      return 'Refunded';
    default:
      return status;
  }
}

function actionErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'INSUFFICIENT_EVENT_PERMISSIONS':
        return 'You do not have permission to perform this action for this event.';
      case 'TICKET_NOT_CHECKED_IN':
        return 'This ticket is not checked in anymore. Refresh the results.';
      case 'TICKET_ALREADY_CHECKED_IN':
        return 'This ticket has already been checked in.';
      case 'TICKET_NOT_VALID':
        return 'This ticket is not valid for admission.';
      case 'TICKET_NOT_FOUND':
        return 'This ticket was not found for this event.';
      case 'NETWORK_ERROR':
        return 'Cannot reach the server. Check your connection.';
      default:
        return error.message;
    }
  }
  return 'The action could not be completed. Please try again.';
}

export default function ParticipantsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const eventId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<EventTicket[]>([]);
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<EventTicket | null>(null);
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);

  const loadStats = useCallback(async () => {
    if (!eventId) return;
    try {
      setStats(await getEventAttendanceStats(eventId));
      setStatsError(false);
    } catch {
      setStatsError(true);
    }
  }, [eventId]);

  useEffect(() => {
    let active = true;

    if (!eventId) {
      return () => {
        active = false;
      };
    }

    getEventAttendanceStats(eventId)
      .then((data) => {
        if (!active) return;
        setStats(data);
        setStatsError(false);
      })
      .catch(() => {
        if (active) setStatsError(true);
      });

    return () => {
      active = false;
    };
  }, [eventId]);

  const runSearch = useCallback(
    async (term: string) => {
      if (!eventId) {
        setSearchError('No event selected. Open this screen from an event.');
        setSearched(true);
        return;
      }

      const trimmed = term.trim();
      const id = requestId.current + 1;
      requestId.current = id;

      if (!trimmed) {
        setResults([]);
        setSearched(false);
        setSearchError(null);
        return;
      }

      setSearching(true);
      setSearchError(null);

      try {
        const rows = await searchEventTickets(eventId, trimmed);
        if (requestId.current !== id) return;
        setResults(rows);
        setSearched(true);
      } catch (error) {
        if (requestId.current !== id) return;
        setResults([]);
        setSearched(true);
        setSearchError(actionErrorMessage(error));
      } finally {
        if (requestId.current === id) {
          setSearching(false);
        }
      }
    },
    [eventId],
  );

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([loadStats(), query.trim() ? runSearch(query) : Promise.resolve()]);
    setRefreshing(false);
  }

  async function submitAction(ticket: EventTicket, action: 'check-in' | 'reverse') {
    if (!eventId || busy) return;
    setBusy(true);

    try {
      if (action === 'check-in') {
        await manualCheckInTicket(eventId, ticket.publicId);
      } else {
        await reverseCheckInTicket(eventId, ticket.publicId);
      }

      setSelected(null);
      await Promise.all([loadStats(), runSearch(query)]);
      Alert.alert(
        'Success',
        action === 'check-in'
          ? 'The ticket was checked in by the server.'
          : 'The check-in was reversed by the server.',
      );
    } catch (error) {
      Alert.alert('Action failed', actionErrorMessage(error));
      await Promise.all([loadStats(), query.trim() ? runSearch(query) : Promise.resolve()]);
    } finally {
      setBusy(false);
    }
  }

  function confirmReverse(ticket: EventTicket) {
    Alert.alert(
      'Reverse check-in?',
      'Only the event owner or an Event Admin can reverse a check-in. The server will verify your permission.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reverse',
          style: 'destructive',
          onPress: () => void submitAction(ticket, 'reverse'),
        },
      ],
    );
  }

  if (!eventId) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.emptyTitle}>No event selected</Text>
        <Text style={styles.empty}>Open this screen from an event to search its tickets.</Text>
        <Pressable onPress={() => router.back()} style={styles.backPill}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Pressable
        onPress={() => router.back()}
        style={({ pressed }) => [styles.backPill, pressed && styles.pressed]}>
        <Text style={styles.backText}>‹ Back</Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.subtitle}>
          {stats
            ? `${stats.totalCheckedIn} of ${stats.totalRegistered} checked in`
            : statsError
              ? 'Attendance statistics unavailable'
              : 'Loading attendance statistics…'}
        </Text>
        <Text style={styles.title}>Participants</Text>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.search}
          placeholder="Search name, email, order, or ticket ID"
          placeholderTextColor="#9ca3af"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => void runSearch(query)}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          editable={!searching}
        />
        <Pressable
          onPress={() => void runSearch(query)}
          disabled={searching || !query.trim()}
          style={({ pressed }) => [
            styles.searchButton,
            (pressed || searching || !query.trim()) && styles.pressed,
          ]}>
          {searching ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.searchButtonText}>Search</Text>
          )}
        </Pressable>
      </View>

      <Text style={styles.searchHint}>
        The backend only lists tickets that match a search term. Enter a name, email, order
        number, or ticket ID.
      </Text>

      <FlatList
        data={results}
        keyExtractor={(item) => item.publicId}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4f46e5" />
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            {searching ? (
              <ActivityIndicator color="#4f46e5" />
            ) : searchError ? (
              <>
                <Text style={styles.emptyTitle}>Search failed</Text>
                <Text style={styles.empty}>{searchError}</Text>
                <Pressable
                  onPress={() => void runSearch(query)}
                  style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              </>
            ) : !searched ? (
              <>
                <Text style={styles.emptyTitle}>Search for a participant</Text>
                <Text style={styles.empty}>
                  Results appear only after a search because the backend does not expose an
                  unrestricted attendee list to event staff.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.emptyTitle}>No tickets found</Text>
                <Text style={styles.empty}>Try a different name, email, order, or ticket ID.</Text>
              </>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const isCheckedIn = item.status === 'CHECKED_IN';
          const canAct = item.status === 'VALID' || isCheckedIn;
          const checkedInTime = formatCheckInTime(item.checkedInAt);

          return (
            <Pressable
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
              onPress={() => canAct && setSelected(item)}
              disabled={!canAct}>
              <View style={[styles.avatar, isCheckedIn && styles.avatarDone]}>
                <Text style={[styles.avatarText, isCheckedIn && styles.avatarTextDone]}>
                  {initials(item.attendeeName ?? item.attendeeEmail)}
                </Text>
              </View>

              <View style={styles.cardBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.attendeeName ?? 'Unnamed attendee'}
                </Text>
                <Text style={styles.rowSubtitle} numberOfLines={1}>
                  {[item.ticketType, item.attendeeEmail].filter(Boolean).join(' · ')}
                </Text>
                <Text style={styles.rowMeta}>
                  Order #{item.orderNumber}
                  {checkedInTime ? ` · checked in at ${checkedInTime}` : ''}
                </Text>
              </View>

              <View
                style={[
                  styles.badge,
                  isCheckedIn
                    ? styles.badgeDone
                    : item.status === 'VALID'
                      ? styles.badgePending
                      : styles.badgeInvalid,
                ]}>
                <Text
                  style={[
                    styles.badgeText,
                    isCheckedIn
                      ? styles.badgeTextDone
                      : item.status === 'VALID'
                        ? styles.badgeTextPending
                        : styles.badgeTextInvalid,
                  ]}>
                  {statusLabel(item.status)}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />

      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!busy) setSelected(null);
        }}>
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            if (!busy) setSelected(null);
          }}>
          <Pressable
            style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}
            onPress={(event) => event.stopPropagation()}>
            <View style={styles.sheetHandle} />

            {selected ? (
              <>
                <View style={styles.sheetHeader}>
                  <View style={[styles.avatar, selected.status === 'CHECKED_IN' && styles.avatarDone]}>
                    <Text
                      style={[
                        styles.avatarText,
                        selected.status === 'CHECKED_IN' && styles.avatarTextDone,
                      ]}>
                      {initials(selected.attendeeName ?? selected.attendeeEmail)}
                    </Text>
                  </View>
                  <View style={styles.cardBody}>
                    <Text style={styles.sheetName}>
                      {selected.attendeeName ?? 'Unnamed attendee'}
                    </Text>
                    <Text style={styles.rowSubtitle}>{selected.attendeeEmail}</Text>
                    <Text style={styles.rowSubtitle}>
                      {selected.ticketType} · Order #{selected.orderNumber}
                    </Text>
                  </View>
                </View>

                <Text style={styles.sheetStatus}>
                  {selected.status === 'CHECKED_IN'
                    ? `Checked in${
                        formatCheckInTime(selected.checkedInAt)
                          ? ` at ${formatCheckInTime(selected.checkedInAt)}`
                          : ''
                      }`
                    : statusLabel(selected.status)}
                </Text>

                {selected.status === 'VALID' ? (
                  <Pressable
                    disabled={busy}
                    onPress={() => void submitAction(selected, 'check-in')}
                    style={({ pressed }) => [
                      styles.actionButton,
                      styles.checkInButton,
                      (pressed || busy) && styles.pressed,
                    ]}>
                    {busy ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.checkInText}>Check in manually</Text>
                    )}
                  </Pressable>
                ) : (
                  <Pressable
                    disabled={busy}
                    onPress={() => confirmReverse(selected)}
                    style={({ pressed }) => [
                      styles.actionButton,
                      styles.undoButton,
                      (pressed || busy) && styles.pressed,
                    ]}>
                    {busy ? (
                      <ActivityIndicator color="#dc2626" />
                    ) : (
                      <Text style={styles.undoText}>Reverse check-in</Text>
                    )}
                  </Pressable>
                )}

                <Pressable
                  disabled={busy}
                  onPress={() => setSelected(null)}
                  style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
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
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 12, backgroundColor: '#f6f7fb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#f6f7fb' },
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

  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  search: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#111827',
    ...shadow,
  },
  searchButton: {
    backgroundColor: '#4f46e5',
    borderRadius: 14,
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 82,
  },
  searchButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  searchHint: { color: '#6b7280', fontSize: 12, marginBottom: 16 },

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
  rowMeta: { fontSize: 12, color: '#9ca3af', marginTop: 3 },

  badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, marginLeft: 8 },
  badgeDone: { backgroundColor: '#dcfce7' },
  badgePending: { backgroundColor: '#f3f4f6' },
  badgeInvalid: { backgroundColor: '#fee2e2' },
  badgeText: { fontSize: 12, fontWeight: '600' },
  badgeTextDone: { color: '#16a34a' },
  badgeTextPending: { color: '#6b7280' },
  badgeTextInvalid: { color: '#dc2626' },

  emptyBox: { alignItems: 'center', marginTop: 60, paddingHorizontal: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#111827', marginBottom: 6 },
  empty: { textAlign: 'center', color: '#6b7280', fontSize: 14 },
  retryButton: {
    marginTop: 16,
    backgroundColor: '#111827',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryText: { color: '#fff', fontWeight: '600' },

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
