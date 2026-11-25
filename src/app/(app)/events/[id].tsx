import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { classifyApiError } from '../../../api/client';
import { describeError } from '../../../api/errors';
import { attendancePercent, getAccessibleEvent } from '../../../api/events';
import { EventRecord, organizerEvents } from '../../../api/organizer';
import { authStyles, Notice, PrimaryButton } from '../../../components/AuthUI';
import { confirmAction, notify } from '../../../components/dialogs';
import { LanguagePicker } from '../../../components/LanguagePicker';
import { useAttendanceStats } from '../../../features/use-attendance-stats';
import { Lang, useLanguage } from '../../../store/language-context';
import { useSelectedEvent } from '../../../store/selected-event-context';
import { AssignedEvent } from '../../../types/event';

const LOCALES: Record<Lang, string> = {
  ru: 'ru-RU',
  kk: 'kk-KZ',
  en: 'en-GB',
};

/** Formats in the event's own timezone so staff see local venue time. */
function formatInZone(
  value: string | undefined,
  locale: string,
  timeZone: string | undefined,
  options: Intl.DateTimeFormatOptions,
) {
  if (!value) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  try {
    return date.toLocaleString(locale, timeZone ? { ...options, timeZone } : options);
  } catch {
    return date.toLocaleString(locale, options);
  }
}

type InfoRowProps = {
  icon: string;
  label: string;
  value: string;
  last?: boolean;
};

function InfoRow({ icon, label, value, last }: InfoRowProps) {
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <View style={styles.infoIconBadge}>
        <Text style={styles.infoIcon}>{icon}</Text>
      </View>
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

type LoadState =
  | { status: 'loading'; id: string }
  | { status: 'ready'; id: string; event: AssignedEvent }
  | { status: 'missing'; id: string }
  | { status: 'error'; id: string; message: string };

export default function EventDetailScreen() {
  const { t, lang } = useLanguage();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { selectEvent } = useSelectedEvent();

  const [load, setLoad] = useState<LoadState | null>(null);
  const [managedEvent, setManagedEvent] = useState<EventRecord | null>(null);
  const [managementError, setManagementError] = useState('');
  const [managementBusy, setManagementBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const stats = useAttendanceStats(id);
  const refreshStats = stats.refresh;
  // Each load gets a generation number; responses from older loads (or after blur) are dropped.
  const generation = useRef(0);

  const locale = LOCALES[lang];

  const loadEvent = useCallback(async () => {
    if (!id) return;
    const gen = ++generation.current;
    const isCurrent = () => generation.current === gen;

    let found: AssignedEvent | null;
    try {
      // Re-read on every focus so a revoked assignment is detected, not cached.
      found = await getAccessibleEvent(id);
    } catch (error) {
      if (!isCurrent()) return;
      if (classifyApiError(error) === 'forbidden') {
        setLoad({ status: 'missing', id });
      } else {
        setLoad({ status: 'error', id, message: describeError(error, t) });
      }
      return;
    }

    if (!isCurrent()) return;
    if (!found) {
      // Not in /events/assigned: deleted, or the user's assignment was revoked.
      setLoad({ status: 'missing', id });
      setManagedEvent(null);
      return;
    }

    setLoad({ status: 'ready', id, event: found });
    selectEvent(id);
    void refreshStats();

    // GET /events/{id} succeeds only for the owner (or a platform admin).
    // Admission staff get 403 and simply don't see management actions.
    organizerEvents
      .get(found.id)
      .then((record) => {
        if (isCurrent()) setManagedEvent(record);
      })
      .catch(() => {
        if (isCurrent()) setManagedEvent(null);
      });
  }, [id, selectEvent, refreshStats, t]);

  // Runs on first mount and whenever the user returns from the scanner or
  // participants screen, so counters always reflect the API.
  useFocusEffect(
    useCallback(() => {
      void loadEvent();
      return () => {
        generation.current += 1;
      };
    }, [loadEvent]),
  );

  const retry = () => {
    if (!id) return;
    setLoad({ status: 'loading', id });
    void loadEvent();
  };

  async function onRefresh() {
    setRefreshing(true);
    await loadEvent();
    setRefreshing(false);
  }

  async function runManagement(action: () => Promise<void>) {
    if (managementBusy) return;
    setManagementBusy(true);
    setManagementError('');
    try {
      await action();
    } catch (e) {
      setManagementError(describeError(e, t));
    } finally {
      setManagementBusy(false);
    }
  }

  const current = load && load.id === id ? load : null;
  const isLoading = !!id && (!current || current.status === 'loading');
  const currentEvent = current?.status === 'ready' ? current.event : null;
  const currentStats = stats.stats;
  const ownedRecord = managedEvent && managedEvent.id === id ? managedEvent : null;

  const back = () => (router.canGoBack() ? router.back() : router.replace('/events'));

  const topBar = (
    <View style={styles.topBar}>
      <Pressable onPress={back} style={({ pressed }) => [styles.backLink, pressed && styles.pressed]}>
        <Text style={styles.backText}>‹ {t.back}</Text>
      </Pressable>
      <LanguagePicker />
    </View>
  );

  if (!id) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.scrollContent}>
          {topBar}
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>{t.noEventSelected}</Text>
            <Text style={styles.emptySubtitle}>{t.chooseEventFirst}</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#111827" />
      </View>
    );
  }

  if (!currentEvent) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.scrollContent}>
          {topBar}
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>{t.eventUnavailable}</Text>
            <Text style={styles.emptySubtitle}>
              {current?.status === 'error' ? current.message : t.eventNotFound}
            </Text>
            <Pressable
              onPress={retry}
              style={({ pressed }) => [styles.secondaryButton, styles.retryButton, pressed && styles.pressed]}>
              <Text style={styles.secondaryButtonText}>{t.retry}</Text>
            </Pressable>
            {current?.status === 'missing' ? (
              <Pressable
                onPress={() => router.replace('/events')}
                style={({ pressed }) => [styles.backLink, pressed && styles.pressed]}>
                <Text style={styles.backText}>{t.navMyEvents}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const percent = attendancePercent(currentStats);
  const tz = currentEvent.timezone;
  const date = formatInZone(currentEvent.startsAt, locale, tz, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timeOpts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  const startTime = formatInZone(currentEvent.startsAt, locale, tz, timeOpts);
  const endTime = formatInZone(currentEvent.endsAt, locale, tz, timeOpts);
  const time = startTime && endTime ? `${startTime} – ${endTime}` : startTime;
  const timeWithZone = time && tz ? `${time} (${tz})` : time;
  const updatedAt = stats.updatedAt
    ? new Date(stats.updatedAt).toLocaleTimeString(locale, timeOpts)
    : null;
  const statusText = currentEvent.status
    ? t.eventStatus[currentEvent.status] ?? currentEvent.status
    : null;

  const visibleRows = [
    { icon: '📅', label: t.dateLabel, value: date },
    { icon: '🕒', label: t.timeLabel, value: timeWithZone },
    { icon: '📍', label: t.locationLabel, value: currentEvent.location },
  ].filter((row): row is { icon: string; label: string; value: string } => Boolean(row.value));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#111827" />
        }>
        {topBar}

        <Text style={authStyles.title}>{currentEvent.name}</Text>
        <Text style={authStyles.subtitle}>
          {statusText ? `${t.statusLabel}: ${statusText}` : t.eventOverview}
        </Text>

        {/* Attendance metrics: authoritative backend stats only */}
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{currentStats?.totalRegistered ?? '—'}</Text>
            <Text style={styles.metricLabel}>{t.registeredCount}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={[styles.metricValue, styles.metricValueSuccess]}>
              {currentStats?.totalCheckedIn ?? '—'}
            </Text>
            <Text style={styles.metricLabel}>{t.checkedInCount}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{currentStats?.remaining ?? '—'}</Text>
            <Text style={styles.metricLabel}>{t.remainingCount}</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          {stats.loading && !currentStats ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#111827" />
              <Text style={styles.mutedText}>{t.loadingAttendance}</Text>
            </View>
          ) : currentStats ? (
            <>
              <View style={styles.progressHeader}>
                <Text style={styles.sectionTitle}>{t.checkInProgress}</Text>
                <Text style={styles.progressPercent}>{percent}%</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${percent}%` }]} />
              </View>
              <Text style={styles.progressMeta}>
                {currentStats.totalCheckedIn} / {currentStats.totalRegistered} {t.attendeesCheckedIn}
              </Text>

              <View style={styles.pillsRow}>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>
                    {t.issuedCount} {currentStats.totalIssued}
                  </Text>
                </View>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>
                    {t.cancelledCount} {currentStats.cancelled}
                  </Text>
                </View>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>
                    {t.refundedCount} {currentStats.refunded}
                  </Text>
                </View>
              </View>

              <View style={styles.statsFooter}>
                <Text style={styles.mutedText}>
                  {updatedAt ? `${t.updatedAt} ${updatedAt}` : ''}
                </Text>
                <Pressable
                  onPress={() => void refreshStats()}
                  disabled={stats.loading}
                  accessibilityRole="button"
                  style={({ pressed }) => [pressed && styles.pressed]}>
                  {stats.loading ? (
                    <ActivityIndicator size="small" color="#111827" />
                  ) : (
                    <Text style={styles.linkText}>{t.refresh}</Text>
                  )}
                </Pressable>
              </View>
              {stats.stale ? <Notice kind="error" text={t.statsStale} /> : null}
            </>
          ) : stats.failed ? (
            <>
              <Notice kind="error" text={t.statsUnavailable} />
              <Pressable onPress={() => void refreshStats()} style={({ pressed }) => [pressed && styles.pressed]}>
                <Text style={styles.linkText}>{t.retry}</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.mutedText}>{t.noAttendanceData}</Text>
          )}
        </View>

        {visibleRows.length > 0 ? (
          <View style={styles.detailsCard}>
            {visibleRows.map((row, index) => (
              <InfoRow
                key={row.label}
                icon={row.icon}
                label={row.label}
                value={row.value}
                last={index === visibleRows.length - 1}
              />
            ))}
          </View>
        ) : null}

        <View style={styles.actions}>
          <PrimaryButton
            label={t.openScanner}
            onPress={() => router.push({ pathname: '/scanner', params: { eventId: currentEvent.id } })}
          />

          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            onPress={() =>
              router.push({
                pathname: '/events/list_of_participants',
                params: { id: currentEvent.id },
              })
            }>
            <Text style={styles.secondaryButtonText}>{t.viewParticipants}</Text>
          </Pressable>
        </View>

        {/* Owner-only management. Hidden entirely for admission staff. */}
        {ownedRecord ? (
          <View style={[styles.sectionCard, styles.manageCard]}>
            <Text style={styles.sectionTitle}>{t.manageTitle}</Text>
            <Text style={[styles.mutedText, styles.manageHint]}>
              {`${t.statusLabel}: ${t.eventStatus[ownedRecord.status] ?? ownedRecord.status} · ${t.visibilityLabel}: ${
                t.visibilityName[ownedRecord.visibility] ?? ownedRecord.visibility
              }`}
            </Text>
            {managementError ? <Notice kind="error" text={managementError} /> : null}

            <View style={styles.actions}>
              {[
                {
                  label: t.editEvent,
                  onPress: () => router.push({ pathname: '/edit-event', params: { id: currentEvent.id } }),
                },
                {
                  label: t.manageTickets,
                  onPress: () => router.push({ pathname: '/tickets', params: { eventId: currentEvent.id } }),
                },
                {
                  label: t.manageAdmins,
                  onPress: () => router.push({ pathname: '/admins', params: { eventId: currentEvent.id } }),
                },
                {
                  label: t.publishChecklist,
                  onPress: () =>
                    void runManagement(async () => {
                      const p = await organizerEvents.preview(currentEvent.id);
                      notify(
                        p.publish_ready ? t.publishReady : t.publishChecklist,
                        p.validation_errors.length ? p.validation_errors.join('\n') : t.publishAllSatisfied,
                      );
                    }),
                },
              ].map((action) => (
                <Pressable
                  key={action.label}
                  disabled={managementBusy}
                  style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                  onPress={action.onPress}>
                  <Text style={styles.secondaryButtonText}>{action.label}</Text>
                </Pressable>
              ))}

              {ownedRecord.status !== 'CANCELLED' && ownedRecord.status !== 'COMPLETED' ? (
                <PrimaryButton
                  label={ownedRecord.status === 'PUBLISHED' ? t.unpublishEvent : t.publishEvent}
                  loading={managementBusy}
                  onPress={() =>
                    void runManagement(async () => {
                      const updated =
                        ownedRecord.status === 'PUBLISHED'
                          ? await organizerEvents.unpublish(currentEvent.id)
                          : await organizerEvents.publish(currentEvent.id);
                      setManagedEvent(updated);
                      void loadEvent();
                    })
                  }
                />
              ) : null}
              <Pressable
                disabled={managementBusy}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                onPress={() =>
                  confirmAction({
                    title: t.duplicateConfirmTitle,
                    message: t.duplicateConfirmBody,
                    confirmLabel: t.duplicateAction,
                    cancelLabel: t.cancelBtn,
                    destructive: false,
                    onConfirm: () =>
                      void runManagement(async () => {
                        const copy = await organizerEvents.duplicate(currentEvent.id);
                        router.replace({ pathname: '/events/[id]', params: { id: copy.id } });
                      }),
                  })
                }>
                <Text style={styles.secondaryButtonText}>{t.duplicateEvent}</Text>
              </Pressable>
              {ownedRecord.status !== 'CANCELLED' ? (
                <Pressable
                  disabled={managementBusy}
                  style={({ pressed }) => [styles.secondaryButton, styles.dangerButton, pressed && styles.pressed]}
                  onPress={() =>
                    confirmAction({
                      title: t.cancelEventConfirmTitle,
                      message: t.cancelEventConfirmBody,
                      confirmLabel: t.cancelEventAction,
                      cancelLabel: t.keepBtn,
                      onConfirm: () =>
                        void runManagement(async () => {
                          setManagedEvent(await organizerEvents.cancel(currentEvent.id));
                          void loadEvent();
                        }),
                    })
                  }>
                  <Text style={[styles.secondaryButtonText, styles.dangerText]}>{t.cancelEvent}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 32 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
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
  backText: { color: '#111827', fontSize: 15, fontWeight: '600' },
  linkText: { color: '#111827', fontSize: 13, fontWeight: '700' },

  metricsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  metricCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  metricValue: { fontSize: 26, fontWeight: '700', color: '#111827' },
  metricValueSuccess: { color: '#16a34a' },
  metricLabel: { marginTop: 4, fontSize: 12, fontWeight: '500', color: '#6b7280', textAlign: 'center' },

  sectionCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  manageCard: { marginTop: 18 },
  manageHint: { marginTop: 4, marginBottom: 12 },
  dangerButton: { borderColor: '#fecaca' },
  dangerText: { color: '#dc2626' },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  progressPercent: { fontSize: 14, fontWeight: '700', color: '#16a34a' },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
    overflow: 'hidden',
  },
  progressFill: { height: 8, borderRadius: 999, backgroundColor: '#16a34a' },
  progressMeta: { marginTop: 8, fontSize: 12, color: '#6b7280' },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  pill: {
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillText: { fontSize: 12, fontWeight: '600', color: '#4b5563' },
  statsFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    minHeight: 20,
  },
  mutedText: { fontSize: 13, color: '#6b7280' },

  detailsCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  infoIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoIcon: { fontSize: 17 },
  infoContent: { flex: 1 },
  infoLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: '#6b7280',
  },
  infoValue: { marginTop: 2, fontSize: 15, fontWeight: '500', color: '#111827' },

  actions: { gap: 10 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  secondaryButtonText: { fontSize: 15, fontWeight: '600', color: '#111827' },

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
  emptySubtitle: { textAlign: 'center', fontSize: 14, color: '#6b7280' },
  retryButton: { alignSelf: 'stretch', marginTop: 16, marginBottom: 8 },
});
