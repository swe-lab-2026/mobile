import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import {
  admissionMessage,
  classifyAdmissionError,
  uncertainOutcomeHint,
} from '../../../api/admission';
import { classifyApiError } from '../../../api/client';
import { describeError } from '../../../api/errors';
import {
  getAccessibleEvent,
  manualCheckInTicket,
  mergeTicketPages,
  replaceTicket,
  reverseCheckInTicket,
  searchEventTickets,
  SEARCH_PAGE_SIZE,
} from '../../../api/events';
import { authStyles, Notice, PrimaryButton } from '../../../components/AuthUI';
import { confirmAction, notify } from '../../../components/dialogs';
import { LanguagePicker } from '../../../components/LanguagePicker';
import { useAttendanceStats } from '../../../features/use-attendance-stats';
import { Dict, Lang, useLanguage } from '../../../store/language-context';
import { AssignedEvent, EventTicket } from '../../../types/event';

const LOCALES: Record<Lang, string> = {
  ru: 'ru-RU',
  kk: 'kk-KZ',
  en: 'en-GB',
};
const SEARCH_DEBOUNCE_MS = 400;

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

function formatCheckInTime(value: string | null | undefined, locale: string, timeZone?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  const options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  try {
    return date.toLocaleTimeString(locale, timeZone ? { ...options, timeZone } : options);
  } catch {
    return date.toLocaleTimeString(locale, options);
  }
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

type Access =
  | { kind: 'checking' }
  | { kind: 'granted'; event: AssignedEvent }
  | { kind: 'denied' }
  | { kind: 'error'; message: string };

interface SearchState {
  query: string;
  items: EventTicket[];
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
}

const EMPTY_SEARCH: SearchState = {
  query: '',
  items: [],
  hasMore: false,
  loading: false,
  loadingMore: false,
  error: null,
};

export default function ParticipantsScreen() {
  const insets = useSafeAreaInsets();
  const { t, lang } = useLanguage();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const eventId = Array.isArray(params.id) ? params.id[0] : params.id;
  const locale = LOCALES[lang];

  const [input, setInput] = useState('');
  const [search, setSearch] = useState<SearchState>(EMPTY_SEARCH);
  const [detailsRevealed, setDetailsRevealed] = useState(false);
  const [access, setAccess] = useState<Access>({ kind: 'checking' });
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<EventTicket | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const stats = useAttendanceStats(eventId);
  const refreshStats = stats.refresh;

  // Every search gets a sequence number and its own AbortController, so a
  // slow response for an old query can never overwrite newer results.
  const searchSeq = useRef(0);
  const searchAbort = useRef<AbortController | null>(null);
  const activeQuery = useRef('');

  const canReverse = access.kind === 'granted' && access.event.canReverseCheckIn;
  const timeZone = access.kind === 'granted' ? access.event.timezone : undefined;

  const checkAccess = useCallback(async () => {
    if (!eventId) return;
    try {
      const event = await getAccessibleEvent(eventId);
      setAccess(event ? { kind: 'granted', event } : { kind: 'denied' });
    } catch (error) {
      setAccess(
        classifyApiError(error) === 'forbidden'
          ? { kind: 'denied' }
          : { kind: 'error', message: describeError(error, t) },
      );
    }
  }, [eventId, t]);

  const runSearch = useCallback(
    async (query: string, mode: 'replace' | 'append' = 'replace', offset = 0) => {
      if (!eventId) return;
      const trimmed = query.trim();
      searchAbort.current?.abort();
      const seq = ++searchSeq.current;
      activeQuery.current = trimmed;

      if (!trimmed) {
        searchAbort.current = null;
        setSearch(EMPTY_SEARCH);
        return;
      }

      const controller = new AbortController();
      searchAbort.current = controller;
      setSearch((prev) =>
        mode === 'append'
          ? { ...prev, loadingMore: true, error: null }
          : { ...prev, query: trimmed, loading: true, error: null, ...(prev.query === trimmed ? {} : { items: [], hasMore: false }) },
      );

      try {
        const page = await searchEventTickets(eventId, trimmed, {
          offset,
          limit: SEARCH_PAGE_SIZE,
          signal: controller.signal,
        });
        if (seq !== searchSeq.current) return;
        setSearch((prev) => ({
          query: trimmed,
          items: mode === 'append' ? mergeTicketPages(prev.items, page.items) : page.items,
          hasMore: page.hasMore,
          loading: false,
          loadingMore: false,
          error: null,
        }));
      } catch (error) {
        if (seq !== searchSeq.current) return;
        if (classifyApiError(error) === 'forbidden') setAccess({ kind: 'denied' });
        setSearch((prev) => ({
          ...prev,
          loading: false,
          loadingMore: false,
          error: describeError(error, t),
        }));
      }
    },
    [eventId, t],
  );

  // Debounced server-side search while typing.
  useEffect(() => {
    const handle = setTimeout(() => {
      if (input.trim() !== activeQuery.current) void runSearch(input);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [input, runSearch]);

  // On focus: re-check access, refresh authoritative stats, and re-run the
  // current search so statuses reflect check-ins made elsewhere (e.g. scanner).
  useFocusEffect(
    useCallback(() => {
      void checkAccess();
      void refreshStats();
      if (activeQuery.current) void runSearch(activeQuery.current);
      return () => {
        searchAbort.current?.abort();
        searchSeq.current += 1;
      };
    }, [checkAccess, refreshStats, runSearch]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([
      checkAccess(),
      refreshStats(),
      activeQuery.current ? runSearch(activeQuery.current) : Promise.resolve(),
    ]);
    setRefreshing(false);
  }

  function loadMore() {
    if (!search.hasMore || search.loading || search.loadingMore || !search.query) return;
    void runSearch(search.query, 'append', search.items.length);
  }

  async function submitAction(ticket: EventTicket, action: 'check-in' | 'reverse') {
    // The ref blocks double taps before React re-renders the disabled button.
    if (!eventId || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);

    try {
      const updated =
        action === 'check-in'
          ? await manualCheckInTicket(eventId, ticket.publicId)
          : await reverseCheckInTicket(eventId, ticket.publicId);

      setSearch((prev) => ({ ...prev, items: replaceTicket(prev.items, updated) }));
      setSelected(null);
      notify(t.successTitle, action === 'check-in' ? t.checkedInSuccess : t.reversedSuccess);
    } catch (error) {
      const result = classifyAdmissionError(error);
      if (result.kind === 'FORBIDDEN') void checkAccess();
      const hint = uncertainOutcomeHint(result, t);
      notify(t.actionFailedTitle, [admissionMessage(result, t), hint].filter(Boolean).join('\n\n'));
      setSelected(null);
      // Re-read the ticket so the list shows its real, server-side status.
      if (activeQuery.current) void runSearch(activeQuery.current);
    } finally {
      busyRef.current = false;
      setBusy(false);
      void refreshStats();
    }
  }

  function confirmReverse(ticket: EventTicket) {
    confirmAction({
      title: t.reverseConfirmTitle,
      message: t.reverseConfirmBody,
      confirmLabel: t.reverseConfirmAction,
      cancelLabel: t.cancelBtn,
      onConfirm: () => void submitAction(ticket, 'reverse'),
    });
  }

  const back = () => (router.canGoBack() ? router.back() : router.replace('/events'));

  const topBar = (
    <View style={styles.topBar}>
      <Pressable onPress={back} style={({ pressed }) => [styles.backLink, pressed && styles.pressed]}>
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

  if (access.kind === 'denied') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {topBar}
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>{t.scannerNoAccessTitle}</Text>
          <Text style={styles.empty}>{t.scannerNoAccessBody}</Text>
          <Pressable
            onPress={() => router.replace('/events')}
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
            <Text style={styles.retryText}>{t.navMyEvents}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const { stats: currentStats } = stats;
  const statsLine = currentStats
    ? `${currentStats.totalCheckedIn} / ${currentStats.totalRegistered} ${t.attendeesCheckedIn}`
    : stats.failed
      ? t.statsUnavailable
      : t.loadingAttendance;

  const hasQuery = !!search.query;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {topBar}

      <Text style={authStyles.title}>{t.participantsTitle}</Text>
      <Text style={authStyles.subtitle}>
        {access.kind === 'granted' ? `${access.event.name} · ` : ''}
        {statsLine}
      </Text>
      {stats.stale ? <Notice kind="info" text={t.statsStale} /> : null}
      {access.kind === 'error' ? <Notice kind="error" text={access.message} /> : null}

      <View style={styles.searchSection}>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.input}
            placeholder={t.searchParticipantPlaceholder}
            placeholderTextColor="#9ca3af"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => void runSearch(input)}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
            maxLength={200}
            accessibilityLabel={t.searchParticipantPlaceholder}
          />
          <Pressable
            onPress={() => void runSearch(input)}
            disabled={search.loading || !input.trim()}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.searchButton,
              (search.loading || !input.trim()) && styles.searchButtonDisabled,
              pressed && styles.pressed,
            ]}>
            {search.loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.searchButtonText}>{t.searchBtn}</Text>
            )}
          </Pressable>
        </View>
      </View>

      {hasQuery ? (
        <View style={styles.visibilityBar}>
          <View style={styles.visibilityInfo}>
            <Text style={styles.visibilityTitle}>
              {t.searchResults} ({search.items.length}
              {search.hasMore ? '+' : ''})
            </Text>
            <Text style={styles.visibilitySubtitle}>
              {detailsRevealed ? t.detailsVisible : t.detailsHidden}
            </Text>
          </View>
          <Pressable
            onPress={() => setDetailsRevealed((prev) => !prev)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.togglePill, pressed && styles.pressed]}>
            <Text style={styles.togglePillText}>{detailsRevealed ? t.hideList : t.showList}</Text>
          </Pressable>
        </View>
      ) : null}

      {search.error ? <Notice kind="error" text={search.error} /> : null}

      <FlatList
        data={hasQuery ? search.items : []}
        keyExtractor={(item) => item.publicId}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        onEndReachedThreshold={0.4}
        onEndReached={loadMore}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#111827" />
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            {!hasQuery ? (
              <>
                <Text style={styles.emptyTitle}>{t.searchFirstTitle}</Text>
                <Text style={styles.empty}>{t.searchFirstHint}</Text>
              </>
            ) : search.loading ? (
              <ActivityIndicator color="#111827" />
            ) : search.error ? (
              <Pressable
                onPress={() => void runSearch(search.query)}
                style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
                <Text style={styles.retryText}>{t.retry}</Text>
              </Pressable>
            ) : (
              <>
                <Text style={styles.emptyTitle}>{t.noParticipantsTitle}</Text>
                <Text style={styles.empty}>{t.noParticipantsSearchHint}</Text>
              </>
            )}
          </View>
        }
        ListFooterComponent={
          hasQuery && search.hasMore ? (
            <Pressable
              onPress={loadMore}
              disabled={search.loadingMore}
              style={({ pressed }) => [styles.loadMore, pressed && styles.pressed]}>
              {search.loadingMore ? (
                <ActivityIndicator color="#111827" />
              ) : (
                <Text style={styles.loadMoreText}>{t.loadMore}</Text>
              )}
            </Pressable>
          ) : undefined
        }
        renderItem={({ item }) => {
          const isCheckedIn = item.status === 'CHECKED_IN';
          const canAct = item.status === 'VALID' || isCheckedIn;
          const checkedInTime = formatCheckInTime(item.checkedInAt, locale, timeZone);

          const displayName = detailsRevealed
            ? item.attendeeName ?? t.unnamedAttendee
            : maskName(item.attendeeName, t.hiddenAttendee);
          const displayEmail = detailsRevealed ? item.attendeeEmail : maskEmail(item.attendeeEmail);

          return (
            <Pressable
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
              onPress={() => canAct && setSelected(item)}
              disabled={!canAct}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canAct }}>
              <View style={[styles.avatar, isCheckedIn && styles.avatarDone]}>
                <Text style={[styles.avatarText, isCheckedIn && styles.avatarTextDone]}>
                  {detailsRevealed ? initials(item.attendeeName ?? item.attendeeEmail) : '••'}
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
                    <Text style={styles.sheetName}>{selected.attendeeName ?? t.unnamedAttendee}</Text>
                    <Text style={styles.rowSubtitle}>{selected.attendeeEmail}</Text>
                    <Text style={styles.rowSubtitle}>
                      {selected.ticketType} · #{selected.orderNumber}
                    </Text>
                    <Text style={styles.rowMeta} selectable>
                      {t.ticketIdLabel}: {selected.publicId}
                    </Text>
                  </View>
                </View>

                <Text style={styles.sheetStatus}>
                  {selected.status === 'CHECKED_IN'
                    ? `${t.checkedInStatus}${
                        formatCheckInTime(selected.checkedInAt, locale, timeZone)
                          ? ` (${formatCheckInTime(selected.checkedInAt, locale, timeZone)})`
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
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.undoButton, (pressed || busy) && styles.pressed]}>
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
  loadMore: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  loadMoreText: { fontSize: 14, fontWeight: '600', color: '#111827' },

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
