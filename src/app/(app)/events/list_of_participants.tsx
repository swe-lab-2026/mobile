import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
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
import { admissionMessage, classifyAdmissionError } from '../../../api/admission';
import {
  getEventAttendanceStats,
  getEventDetails,
  manualCheckInTicket,
  reverseCheckInTicket,
  searchEventTickets,
} from '../../../api/events';
import { organizerEvents } from '../../../api/organizer';
import { authStyles, Notice, PrimaryButton } from '../../../components/AuthUI';
import { LanguagePicker } from '../../../components/LanguagePicker';
import { useAuth } from '../../../store/auth-context';
import { Dict, Lang, useLanguage } from '../../../store/language-context';
import { AttendanceStats, EventTicket } from '../../../types/event';

const LOCALES: Record<Lang, string> = {
  ru: 'ru-RU',
  kk: 'kk-KZ',
  en: 'en-GB',
};

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

function maskName(name: string | null | undefined, fallback: string): string {
  if (!name) return fallback;
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => `${part[0]}${'•'.repeat(Math.max(part.length - 1, 2))}`)
    .join(' ');
}

function maskEmail(email?: string | null): string {
  if (!email || !email.includes('@')) return '••••@••••.•••';
  const [local, domain] = email.split('@');
  const visible = local.slice(0, 2);
  return `${visible}${'•'.repeat(Math.max(local.length - 2, 3))}@${domain}`;
}

function formatCheckInTime(value: string | null | undefined, locale: string) {
  if (!value) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

function statusLabel(status: string, t: Dict) {
  switch (status) {
    case 'VALID':
      return t.notCheckedIn;
    case 'CHECKED_IN':
      return t.checkedInStatus;
    case 'CANCELLED':
      return t.cancelledStatus;
    case 'REFUNDED':
      return t.refundedStatus;
    default:
      return status;
  }
}

function actionErrorMessage(error: unknown, t: Dict): string {
  return admissionMessage(classifyAdmissionError(error), t);
}

/**
 * UI-side mirror of the backend reversal gate (owner, PLATFORM_ADMIN or
 * EVENT_ADMIN). The backend still enforces it; this only hides Undo from
 * users who would be rejected. Unknown means hidden.
 */
async function resolveReversalPermission(
  eventId: string,
  userId: string | undefined,
  isPlatformAdmin: boolean,
): Promise<boolean> {
  if (isPlatformAdmin) return true;
  const assigned = await getEventDetails(eventId).catch(() => null);
  if (typeof assigned?.canReverseCheckIn === 'boolean') return assigned.canReverseCheckIn;
  const record = await organizerEvents.get(eventId).catch(() => null);
  return !!record && !!userId && record.owner_user_id === userId;
}

export default function ParticipantsScreen() {
  const insets = useSafeAreaInsets();
  const { t, lang } = useLanguage();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const eventId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [query, setQuery] = useState('');
  const [allTickets, setAllTickets] = useState<EventTicket[]>([]);
  const [listRevealed, setListRevealed] = useState(false);
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<EventTicket | null>(null);
  const [busy, setBusy] = useState(false);
  const [reversal, setReversal] = useState<{ eventId: string; allowed: boolean } | null>(null);
  const requestId = useRef(0);
  const { user, isPlatformAdmin } = useAuth();
  const canReverse = !!eventId && reversal?.eventId === eventId && reversal.allowed;
  const locale = LOCALES[lang];

  const loadData = useCallback(
    async (searchTerm = '') => {
      if (!eventId) return;
      const id = requestId.current + 1;
      requestId.current = id;

      setLoading(true);
      setLoadError(null);

      const [statsResult, ticketsResult] = await Promise.allSettled([
        getEventAttendanceStats(eventId),
        searchEventTickets(eventId, searchTerm.trim()),
      ]);

      if (requestId.current !== id) return;

      if (statsResult.status === 'fulfilled') {
        setStats(statsResult.value);
        setStatsError(false);
      } else {
        setStatsError(true);
      }

      if (ticketsResult.status === 'fulfilled') {
        setAllTickets(ticketsResult.value);
      } else {
        setAllTickets([]);
        setLoadError(actionErrorMessage(ticketsResult.reason, t));
      }

      setLoading(false);
    },
    [eventId, t],
  );

  // Reload on focus so counts and statuses reflect check-ins made elsewhere (e.g. the scanner).
  const queryRef = useRef('');
  useFocusEffect(
    useCallback(() => {
      void loadData(queryRef.current);
    }, [loadData]),
  );

  const userId = user?.userId;
  useFocusEffect(
    useCallback(() => {
      if (!eventId) return;
      let active = true;
      void resolveReversalPermission(eventId, userId, isPlatformAdmin).then((allowed) => {
        if (active) setReversal({ eventId, allowed });
      });
      return () => {
        active = false;
      };
    }, [eventId, userId, isPlatformAdmin]),
  );

  const filteredTickets = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return allTickets;
    return allTickets.filter((item) => {
      const name = item.attendeeName?.toLowerCase() ?? '';
      const email = item.attendeeEmail?.toLowerCase() ?? '';
      const order = String(item.orderNumber ?? '');
      const publicId = item.publicId?.toLowerCase() ?? '';
      return (
        name.includes(trimmed) ||
        email.includes(trimmed) ||
        order.includes(trimmed) ||
        publicId.includes(trimmed)
      );
    });
  }, [allTickets, query]);

  async function onRefresh() {
    setRefreshing(true);
    await loadData(query);
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
      await loadData(query);
      Alert.alert(
        t.successTitle,
        action === 'check-in' ? t.checkedInSuccess : t.reversedSuccess,
      );
    } catch (error) {
      Alert.alert(t.actionFailedTitle, actionErrorMessage(error, t));
      await loadData(query);
    } finally {
      setBusy(false);
    }
  }

  function confirmReverse(ticket: EventTicket) {
    Alert.alert(t.reverseConfirmTitle, t.reverseConfirmBody, [
      { text: t.cancelBtn, style: 'cancel' },
      {
        text: t.reverseConfirmAction,
        style: 'destructive',
        onPress: () => void submitAction(ticket, 'reverse'),
      },
    ]);
  }

  const topBar = (
    <View style={styles.topBar}>
      <Pressable
        onPress={() => router.back()}
        style={({ pressed }) => [styles.backLink, pressed && styles.pressed]}>
        <Text style={styles.backText}>‹ {t.back}</Text>
      </Pressable>
      <LanguagePicker />
    </View>
  );

  if (!eventId) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {topBar}
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>{t.noEventSelected}</Text>
          <Text style={styles.empty}>{t.errNoEventSelected}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const totalCount = stats?.totalRegistered ?? allTickets.length;
  const checkedInCount =
    stats?.totalCheckedIn ?? allTickets.filter((item) => item.status === 'CHECKED_IN').length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {topBar}

      <Text style={authStyles.title}>{t.participantsTitle}</Text>
      <Text style={authStyles.subtitle}>
        {stats || allTickets.length > 0
          ? `${checkedInCount} / ${totalCount} ${t.attendeesCheckedIn}`
          : statsError
            ? t.statsUnavailable
            : t.loadingParticipants}
      </Text>

      {/* Overall list summary + Show/Hide toggle */}
      <View style={styles.visibilityBar}>
        <View style={styles.visibilityInfo}>
          <Text style={styles.visibilityTitle}>
            {t.overallList} ({filteredTickets.length})
          </Text>
          <Text style={styles.visibilitySubtitle}>
            {listRevealed ? t.detailsVisible : t.detailsHidden}
          </Text>
        </View>
        <Pressable
          onPress={() => setListRevealed((prev) => !prev)}
          style={({ pressed }) => [styles.togglePill, pressed && styles.pressed]}>
          <Text style={styles.togglePillText}>
            {listRevealed ? t.hideList : t.showList}
          </Text>
        </Pressable>
      </View>

      <View style={styles.searchSection}>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.input}
            placeholder={t.searchParticipantPlaceholder}
            placeholderTextColor="#9ca3af"
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              queryRef.current = text;
              if (text.trim()) setListRevealed(true);
            }}
            onSubmitEditing={() => void loadData(query)}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
          <Pressable
            onPress={() => void loadData(query)}
            disabled={loading}
            style={({ pressed }) => [
              styles.searchButton,
              loading && styles.searchButtonDisabled,
              pressed && styles.pressed,
            ]}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.searchButtonText}>{t.searchBtn}</Text>
            )}
          </Pressable>
        </View>
      </View>

      {loadError ? <Notice kind="error" text={loadError} /> : null}

      <FlatList
        data={filteredTickets}
        keyExtractor={(item) => item.publicId}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#111827" />
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            {loading ? (
              <ActivityIndicator color="#111827" />
            ) : loadError ? (
              <Pressable
                onPress={() => void loadData(query)}
                style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
                <Text style={styles.retryText}>{t.retry}</Text>
              </Pressable>
            ) : (
              <>
                <Text style={styles.emptyTitle}>{t.noParticipantsTitle}</Text>
                <Text style={styles.empty}>
                  {query.trim() ? t.noParticipantsSearchHint : t.noParticipantsEmptyHint}
                </Text>
              </>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const isCheckedIn = item.status === 'CHECKED_IN';
          const canAct = item.status === 'VALID' || isCheckedIn;
          const checkedInTime = formatCheckInTime(item.checkedInAt, locale);

          const displayName = listRevealed
            ? item.attendeeName ?? t.unnamedAttendee
            : maskName(item.attendeeName, t.hiddenAttendee);
          const displayEmail = listRevealed
            ? item.attendeeEmail
            : maskEmail(item.attendeeEmail);

          return (
            <Pressable
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
              onPress={() => canAct && setSelected(item)}
              disabled={!canAct}>
              <View style={[styles.avatar, isCheckedIn && styles.avatarDone]}>
                <Text style={[styles.avatarText, isCheckedIn && styles.avatarTextDone]}>
                  {listRevealed
                    ? initials(item.attendeeName ?? item.attendeeEmail)
                    : '••'}
                </Text>
              </View>

              <View style={styles.cardBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {displayName}
                </Text>
                <Text style={styles.rowSubtitle} numberOfLines={1}>
                  {[item.ticketType, displayEmail].filter(Boolean).join(' · ')}
                </Text>
                <Text style={styles.rowMeta}>
                  #{item.orderNumber}
                  {checkedInTime ? ` · ${t.checkedInAt} ${checkedInTime}` : ''}
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
                  {statusLabel(item.status, t)}
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
                  <View
                    style={[
                      styles.avatar,
                      selected.status === 'CHECKED_IN' && styles.avatarDone,
                    ]}>
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
                      {selected.attendeeName ?? t.unnamedAttendee}
                    </Text>
                    <Text style={styles.rowSubtitle}>{selected.attendeeEmail}</Text>
                    <Text style={styles.rowSubtitle}>
                      {selected.ticketType} · #{selected.orderNumber}
                    </Text>
                  </View>
                </View>

                <Text style={styles.sheetStatus}>
                  {selected.status === 'CHECKED_IN'
                    ? `${t.checkedInStatus}${
                        formatCheckInTime(selected.checkedInAt, locale)
                          ? ` (${formatCheckInTime(selected.checkedInAt, locale)})`
                          : ''
                      }`
                    : statusLabel(selected.status, t)}
                </Text>

                {selected.status === 'VALID' ? (
                  <PrimaryButton
                    label={t.checkInManually}
                    onPress={() => void submitAction(selected, 'check-in')}
                    loading={busy}
                  />
                ) : !canReverse ? (
                  <Notice kind="info" text={t.reverseNotPermitted} />
                ) : (
                  <Pressable
                    disabled={busy}
                    onPress={() => confirmReverse(selected)}
                    style={({ pressed }) => [
                      styles.undoButton,
                      (pressed || busy) && styles.pressed,
                    ]}>
                    {busy ? (
                      <ActivityIndicator color="#dc2626" />
                    ) : (
                      <Text style={styles.undoText}>{t.reverseCheckIn}</Text>
                    )}
                  </Pressable>
                )}

                <Pressable
                  disabled={busy}
                  onPress={() => setSelected(null)}
                  style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}>
                  <Text style={styles.cancelText}>{t.cancelBtn}</Text>
                </Pressable>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
    backgroundColor: '#fff',
  },
  pressed: { opacity: 0.7 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backLink: { paddingVertical: 4 },
  backText: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '600',
  },

  visibilityBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  visibilityInfo: {
    flex: 1,
    marginRight: 12,
  },
  visibilityTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  visibilitySubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  togglePill: {
    backgroundColor: '#111827',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  togglePillText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },

  searchSection: { marginBottom: 14 },
  searchRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#111827',
  },
  searchButton: {
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 84,
  },
  searchButtonDisabled: { backgroundColor: '#9ca3af' },
  searchButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarDone: { backgroundColor: '#dcfce7' },
  avatarText: { fontSize: 14, fontWeight: '700', color: '#374151' },
  avatarTextDone: { color: '#16a34a' },
  cardBody: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  rowSubtitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  rowMeta: { fontSize: 12, color: '#9ca3af', marginTop: 2 },

  badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 10, marginLeft: 8 },
  badgeDone: { backgroundColor: '#dcfce7' },
  badgePending: { backgroundColor: '#f3f4f6' },
  badgeInvalid: { backgroundColor: '#fee2e2' },
  badgeText: { fontSize: 12, fontWeight: '600' },
  badgeTextDone: { color: '#16a34a' },
  badgeTextPending: { color: '#4b5563' },
  badgeTextInvalid: { color: '#dc2626' },

  emptyBox: {
    alignItems: 'center',
    marginTop: 32,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    backgroundColor: '#fafafa',
  },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 4 },
  empty: { textAlign: 'center', color: '#6b7280', fontSize: 14 },
  retryButton: {
    marginTop: 12,
    backgroundColor: '#111827',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17,24,39,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
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
  sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  sheetName: { fontSize: 18, fontWeight: '700', color: '#111827' },
  sheetStatus: { fontSize: 14, color: '#6b7280', marginBottom: 20 },

  undoButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    marginBottom: 8,
  },
  undoText: { color: '#dc2626', fontSize: 15, fontWeight: '600' },
  cancelButton: { paddingVertical: 14, alignItems: 'center' },
  cancelText: { color: '#6b7280', fontSize: 15, fontWeight: '600' },
});