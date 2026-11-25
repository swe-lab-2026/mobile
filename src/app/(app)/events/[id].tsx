import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError } from '../../../api/client';
import { getEventAttendanceStats, getEventDetails } from '../../../api/events';
import { EventRecord, organizerEvents } from '../../../api/organizer';
import { authStyles, Notice, PrimaryButton } from '../../../components/AuthUI';
import { LanguagePicker } from '../../../components/LanguagePicker';
import { Lang, useLanguage } from '../../../store/language-context';
import { useSelectedEvent } from '../../../store/selected-event-context';
import { AttendanceStats, EventDetails } from '../../../types/event';

const LOCALES: Record<Lang, string> = {
  ru: 'ru-RU',
  kk: 'kk-KZ',
  en: 'en-GB',
};

// Alert.alert with buttons is a no-op on react-native-web, so fall back to the browser dialogs.
function notify(title: string, message: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

function confirmAction(title: string, message: string, confirmLabel: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

function formatDate(value: string | undefined, locale: string) {
  if (!value) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatTime(value: string | undefined, locale: string) {
  if (!value) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
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

export default function EventDetailScreen() {
  const { t, lang } = useLanguage();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { selectEvent } = useSelectedEvent();

  const [event, setEvent] = useState<EventDetails | null>(null);
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [managedEvent, setManagedEvent] = useState<EventRecord | null>(null);
  const [managementError, setManagementError] = useState('');

  const currentEvent = id && event?.id === id ? event : null;
  const isLoading = !!id && (loading || event?.id !== id);
  const locale = LOCALES[lang];

  useEffect(() => {
    let active = true;

    if (!id) {
      return () => {
        active = false;
      };
    }

    getEventDetails(id)
      .then((found) => {
        if (!active) return;
        setEvent(found);
        setManagedEvent(null);
        setManagementError('');
        if (found) {
          // Only succeeds for the event owner; others just don't see owner-only actions.
          organizerEvents
            .get(found.id)
            .then((record) => {
              if (active) setManagedEvent(record);
            })
            .catch(() => {});
        }
        setLoadError(null);
        setLoading(false);
        setStats(null);
        setStatsError(false);

        if (!found) return;

        selectEvent(id);
        setStatsLoading(true);
        getEventAttendanceStats(found.id)
          .then((data) => {
            if (active) setStats(data);
          })
          .catch(() => {
            if (active) setStatsError(true);
          })
          .finally(() => {
            if (active) setStatsLoading(false);
          });
      })
      .catch((error) => {
        if (!active) return;
        setEvent(null);
        setStatsError(true);
        setLoading(false);
        setLoadError(
          error instanceof ApiError && error.status === 0
            ? t.errNetwork
            : t.errLoadEvent,
        );
      });

    return () => {
      active = false;
    };
  }, [id, selectEvent, t.errLoadEvent, t.errNetwork]);

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
              {loadError ?? t.eventNotFound}
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const registered = stats?.totalRegistered;
  const checkedIn = stats?.totalCheckedIn;
  const progress =
    stats && stats.totalRegistered > 0
      ? Math.min(stats.totalCheckedIn / stats.totalRegistered, 1)
      : 0;
  const percent = Math.round(progress * 100);

  const date = formatDate(currentEvent.startsAt, locale);
  const startTime = formatTime(currentEvent.startsAt, locale);
  const endTime = formatTime(currentEvent.endsAt, locale);
  const time = startTime && endTime ? `${startTime} – ${endTime}` : startTime;

  const visibleRows = [
    { icon: '📅', label: t.dateLabel, value: date },
    { icon: '🕒', label: t.timeLabel, value: time },
    { icon: '📍', label: t.locationLabel, value: currentEvent.location },
    { icon: '👤', label: t.organizerLabel, value: currentEvent.organizer },
  ].filter((row): row is { icon: string; label: string; value: string } => Boolean(row.value));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {topBar}

        <Text style={authStyles.title}>{currentEvent.name}</Text>
        <Text style={authStyles.subtitle}>
          {currentEvent.status
            ? `${t.statusLabel}: ${currentEvent.status}`
            : t.eventOverview}
        </Text>

        {/* Attendance metrics */}
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{registered ?? '—'}</Text>
            <Text style={styles.metricLabel}>{t.registeredCount}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={[styles.metricValue, styles.metricValueSuccess]}>
              {checkedIn ?? '—'}
            </Text>
            <Text style={styles.metricLabel}>{t.checkedInCount}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{stats?.remaining ?? '—'}</Text>
            <Text style={styles.metricLabel}>{t.remainingCount}</Text>
          </View>
        </View>

        {/* Progress card */}
        <View style={styles.sectionCard}>
          {statsLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#111827" />
              <Text style={styles.mutedText}>{t.loadingAttendance}</Text>
            </View>
          ) : stats ? (
            <>
              <View style={styles.progressHeader}>
                <Text style={styles.sectionTitle}>{t.checkInProgress}</Text>
                <Text style={styles.progressPercent}>{percent}%</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${percent}%` }]} />
              </View>
              <Text style={styles.progressMeta}>
                {stats.totalCheckedIn} / {stats.totalRegistered} {t.attendeesCheckedIn}
              </Text>

              <View style={styles.pillsRow}>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>
                    {t.issuedCount} {stats.totalIssued}
                  </Text>
                </View>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>
                    {t.cancelledCount} {stats.cancelled}
                  </Text>
                </View>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>
                    {t.refundedCount} {stats.refunded}
                  </Text>
                </View>
              </View>
            </>
          ) : statsError ? (
            <Notice kind="error" text={t.statsUnavailable} />
          ) : (
            <Text style={styles.mutedText}>{t.noAttendanceData}</Text>
          )}
        </View>

        {/* Event schedule & location details */}
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

        {/* Actions */}
        <View style={styles.actions}>
          <PrimaryButton
            label={t.openScanner}
            onPress={() =>
              router.push({ pathname: '/scanner', params: { eventId: currentEvent.id } })
            }
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

        {/* Organizer management */}
        <View style={[styles.sectionCard, styles.manageCard]}>
          <Text style={styles.sectionTitle}>Organizer management</Text>
          <Text style={[styles.mutedText, styles.manageHint]}>
            {managedEvent
              ? `Status: ${managedEvent.status} · Visibility: ${managedEvent.visibility}`
              : 'Management actions are available to the event owner.'}
          </Text>
          {managementError ? <Notice kind="error" text={managementError} /> : null}

          <View style={styles.actions}>
            {[
              {
                label: 'Edit event',
                onPress: () =>
                  router.push({ pathname: '/edit-event', params: { id: currentEvent.id } }),
              },
              {
                label: 'Manage ticket types & inventory',
                onPress: () =>
                  router.push({ pathname: '/tickets', params: { eventId: currentEvent.id } }),
              },
              {
                label: 'Manage event administrators',
                onPress: () =>
                  router.push({ pathname: '/admins', params: { eventId: currentEvent.id } }),
              },
              {
                label: 'Publishing checklist',
                onPress: async () => {
                  try {
                    const p = await organizerEvents.preview(currentEvent.id);
                    notify(
                      p.publish_ready ? 'Ready to publish' : 'Publishing checklist',
                      p.validation_errors.length
                        ? p.validation_errors.join('\n')
                        : 'All publishing requirements are satisfied.',
                    );
                  } catch (e: any) {
                    setManagementError(e?.message ?? 'Could not load publishing checklist');
                  }
                },
              },
            ].map((action) => (
              <Pressable
                key={action.label}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                onPress={action.onPress}>
                <Text style={styles.secondaryButtonText}>{action.label}</Text>
              </Pressable>
            ))}

            {managedEvent ? (
              <>
                <PrimaryButton
                  label={managedEvent.status === 'PUBLISHED' ? 'Unpublish event' : 'Publish event'}
                  onPress={async () => {
                    try {
                      const updated =
                        managedEvent.status === 'PUBLISHED'
                          ? await organizerEvents.unpublish(currentEvent.id)
                          : await organizerEvents.publish(currentEvent.id);
                      setManagedEvent(updated);
                      setManagementError('');
                    } catch (e: any) {
                      setManagementError(e?.message ?? 'Could not update publishing status');
                    }
                  }}
                />
                <Pressable
                  style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                  onPress={() =>
                    confirmAction('Duplicate event?', 'Create a draft copy of this event?', 'Duplicate', async () => {
                      try {
                        const copy = await organizerEvents.duplicate(currentEvent.id);
                        router.replace({ pathname: '/events/[id]', params: { id: copy.id } });
                      } catch (e: any) {
                        setManagementError(e?.message ?? 'Could not duplicate event');
                      }
                    })
                  }>
                  <Text style={styles.secondaryButtonText}>Duplicate event</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    styles.dangerButton,
                    pressed && styles.pressed,
                  ]}
                  onPress={() =>
                    confirmAction('Cancel event?', 'This changes the event status to CANCELLED.', 'Cancel event', async () => {
                      try {
                        setManagedEvent(await organizerEvents.cancel(currentEvent.id));
                      } catch (e: any) {
                        setManagementError(e?.message ?? 'Could not cancel event');
                      }
                    })
                  }>
                  <Text style={[styles.secondaryButtonText, styles.dangerText]}>Cancel event</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
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
  metricLabel: { marginTop: 4, fontSize: 12, fontWeight: '500', color: '#6b7280' },

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
});