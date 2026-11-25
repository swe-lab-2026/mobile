import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from 'expo-camera';
import { useFocusEffect, useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  admissionMessage,
  admissionTitle,
  classifyAdmissionError,
  likelyRecordedByEarlierAttempt,
  uncertainOutcomeHint,
  type AdmissionRejection,
} from '../../api/admission';
import { classifyApiError } from '../../api/client';
import { checkInTicket, getAccessibleEvent } from '../../api/events';
import { LanguagePicker } from '../../components/LanguagePicker';
import { createScanGate } from '../../features/scan-gate';
import { Lang, useLanguage } from '../../store/language-context';
import type { AssignedEvent, CheckedInTicket } from '../../types/event';

const FRAME_SIZE = 250;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BARCODE_SETTINGS = { barcodeTypes: ['qr' as const] };
const LOCALES: Record<Lang, string> = {
  ru: 'ru-RU',
  kk: 'kk-KZ',
  en: 'en-GB',
};

type RejectReason = AdmissionRejection | 'NO_EVENT' | 'CAMERA';

type ScanState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; ticket: CheckedInTicket }
  | { kind: 'recorded'; checkedInAt?: string }
  | {
      kind: 'rejected';
      reason: RejectReason;
      title: string;
      message: string;
      hint?: string | null;
      checkedInAt?: string;
      /** Set for transient failures: the payload to resubmit on retry. */
      retryPayload?: string;
      /** Time of the first attempt whose outcome is unknown, if any. */
      uncertainSince?: number;
    };

/**
 * Admission access for the event, checked against /events/assigned.
 * 'unknown' (e.g. offline) does not block scanning: the backend still
 * authorizes every check-in request.
 */
type AccessState =
  | { kind: 'checking' }
  | { kind: 'granted'; event: AssignedEvent }
  | { kind: 'denied' }
  | { kind: 'unknown' };

function formatDateTime(value: string | null | undefined, locale: string, timeZone?: string) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  };
  try {
    return d.toLocaleString(locale, timeZone ? { ...options, timeZone } : options);
  } catch {
    return d.toLocaleString(locale, options);
  }
}

function bannerStyle(reason: RejectReason) {
  switch (reason) {
    case 'ALREADY_CHECKED_IN':
    case 'CAMPAIGN_QR':
    case 'WRONG_EVENT':
      return styles.bannerWarn;
    case 'NETWORK':
    case 'TIMEOUT':
    case 'SERVER':
      return styles.bannerNeutral;
    default:
      return styles.bannerError;
  }
}

function bannerIcon(reason: RejectReason) {
  switch (reason) {
    case 'ALREADY_CHECKED_IN':
    case 'CAMPAIGN_QR':
    case 'WRONG_EVENT':
      return '⚠️';
    case 'NETWORK':
    case 'TIMEOUT':
      return '📶';
    case 'SERVER':
      return '🛠️';
    default:
      return '❌';
  }
}

export default function ScannerScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { t, lang } = useLanguage();
  const locale = LOCALES[lang];

  const params = useLocalSearchParams<{ eventId?: string | string[] }>();
  const rawEventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;
  const eventId = rawEventId && UUID_PATTERN.test(rawEventId) ? rawEventId : null;

  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<ScanState>({ kind: 'idle' });
  const [access, setAccess] = useState<AccessState>({ kind: 'checking' });
  const [torchOn, setTorchOn] = useState(false);
  const [gate] = useState(() => createScanGate());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Re-check admission access whenever the scanner gains focus, so a revoked
  // assignment is noticed even when the screen is reopened from history.
  useFocusEffect(
    useCallback(() => {
      if (!eventId) return;
      let active = true;
      getAccessibleEvent(eventId)
        .then((event) => {
          if (!active) return;
          setAccess(event ? { kind: 'granted', event } : { kind: 'denied' });
        })
        .catch((error) => {
          if (!active) return;
          const kind = classifyApiError(error);
          setAccess(kind === 'forbidden' ? { kind: 'denied' } : { kind: 'unknown' });
        });
      return () => {
        active = false;
      };
    }, [eventId]),
  );

  const runCheckIn = useCallback(
    async (payload: string, uncertainSince?: number) => {
      if (!eventId) {
        gate.release();
        setState({
          kind: 'rejected',
          reason: 'NO_EVENT',
          title: t.checkInFailed,
          message: t.errNoEventSelected,
        });
        return;
      }

      const attemptAt = Date.now();
      setState({ kind: 'loading' });

      try {
        const ticket = await checkInTicket(eventId, payload);
        if (mounted.current) setState({ kind: 'success', ticket });
      } catch (e) {
        if (!mounted.current) return;
        const result = classifyAdmissionError(e);

        // A retry after a lost response may find the earlier attempt already applied.
        if (uncertainSince !== undefined && likelyRecordedByEarlierAttempt(result, uncertainSince)) {
          setState({ kind: 'recorded', checkedInAt: result.checkedInAt });
          return;
        }

        if (result.kind === 'FORBIDDEN') setAccess({ kind: 'denied' });

        setState({
          kind: 'rejected',
          reason: result.kind,
          title: admissionTitle(result.kind, t),
          message: admissionMessage(result, t),
          hint: uncertainOutcomeHint(result, t),
          checkedInAt: result.checkedInAt,
          retryPayload: result.retryable ? payload : undefined,
          uncertainSince: result.uncertain ? (uncertainSince ?? attemptAt) : uncertainSince,
        });
      } finally {
        gate.release();
      }
    },
    [eventId, gate, t],
  );

  const handleBarcodeScanned = useCallback(
    ({ data }: BarcodeScanningResult) => {
      const payload = data?.trim();
      if (!payload || !gate.tryAcquire(payload)) return;
      void runCheckIn(payload);
    },
    [gate, runCheckIn],
  );

  const retry = (payload: string, uncertainSince?: number) => {
    // Repeated taps cannot start concurrent requests.
    if (!gate.tryAcquireRetry()) return;
    void runCheckIn(payload, uncertainSince);
  };

  const resetScanner = () => {
    gate.reset();
    setState({ kind: 'idle' });
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace('/events'));

  if (!eventId) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.infoTitle}>{t.noEventSelected}</Text>
        <Text style={styles.infoText}>{t.errNoEventSelected}</Text>
        <TouchableOpacity style={styles.button} onPress={back}>
          <Text style={styles.buttonText}>‹ {t.back}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (access.kind === 'denied') {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.infoTitle}>{t.scannerNoAccessTitle}</Text>
        <Text style={styles.infoText}>{t.scannerNoAccessBody}</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.replace('/events')}>
          <Text style={styles.buttonText}>{t.navMyEvents}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!permission) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color="#fff" style={{ marginBottom: 12 }} />
        <Text style={styles.infoText}>{t.loadingPermissions}</Text>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    // Once the OS stops showing the prompt, the only recovery path is Settings.
    const blocked = !permission.canAskAgain && Platform.OS !== 'web';
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.infoText}>
          {blocked ? t.cameraPermissionDenied : t.cameraPermissionRequired}
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => (blocked ? void Linking.openSettings() : void requestPermission())}>
          <Text style={styles.buttonText}>{blocked ? t.openSettings : t.grantPermission}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.secondaryAction]} onPress={back}>
          <Text style={styles.buttonText}>‹ {t.back}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const scanning = state.kind === 'idle';
  // The camera only runs while this screen is focused and waiting for a code.
  const cameraActive = isFocused && scanning;
  const eventTimeZone = access.kind === 'granted' ? access.event.timezone : undefined;
  const duplicateTime =
    state.kind === 'rejected' && state.reason === 'ALREADY_CHECKED_IN'
      ? formatDateTime(state.checkedInAt, locale, eventTimeZone)
      : null;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {isFocused ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          active={cameraActive}
          autofocus="on"
          facing="back"
          enableTorch={torchOn && cameraActive}
          barcodeScannerSettings={BARCODE_SETTINGS}
          onBarcodeScanned={cameraActive ? handleBarcodeScanned : undefined}
          onMountError={(e) =>
            setState({
              kind: 'rejected',
              reason: 'CAMERA',
              title: t.checkInFailed,
              message: e.message || t.cameraMountError,
            })
          }
        />
      ) : null}

      <View style={styles.overlayContainer} pointerEvents="none">
        <View style={styles.scanFrame}>
          <View style={[styles.corner, styles.cornerTopLeft]} />
          <View style={[styles.corner, styles.cornerTopRight]} />
          <View style={[styles.corner, styles.cornerBottomLeft]} />
          <View style={[styles.corner, styles.cornerBottomRight]} />
        </View>
      </View>

      <SafeAreaView style={styles.topBar} pointerEvents="box-none" edges={['top']}>
        <View style={styles.headerLeftColumn}>
          <Text style={styles.title}>{t.scannerTitle}</Text>
          {access.kind === 'granted' ? (
            <Text style={styles.eventName} numberOfLines={1}>
              {access.event.name}
            </Text>
          ) : access.kind === 'checking' ? (
            <Text style={styles.eventName}>{t.checkingAccess}</Text>
          ) : null}
          <TouchableOpacity style={styles.backButtonUnder} onPress={back}>
            <Text style={styles.backButtonText}>‹ {t.back}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.headerRightGroup}>
          <LanguagePicker />
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setTorchOn((p) => !p)}
            accessibilityRole="button"
            accessibilityState={{ selected: torchOn }}>
            <Text style={styles.torchText}>{torchOn ? '🔦' : '💡'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {scanning && <Text style={styles.hintText}>{t.alignQrHint}</Text>}

      {state.kind === 'loading' && (
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.loadingText}>{t.checkingTicket}</Text>
        </View>
      )}

      {state.kind === 'success' && (
        <SafeAreaView style={styles.resultCard} edges={['bottom']}>
          <View style={[styles.statusBanner, styles.bannerOk]}>
            <Text style={styles.statusText}>✅ {t.admittedTitle}</Text>
          </View>
          <Text style={styles.attendeeName}>
            {state.ticket.attendeeName ?? t.unnamedAttendee}
          </Text>
          <Text style={styles.attendeeMeta}>{state.ticket.attendeeEmail}</Text>
          <Text style={styles.attendeeMeta}>
            {state.ticket.ticketType} · #{state.ticket.orderNumber}
          </Text>
          {formatDateTime(state.ticket.checkedInAt, locale, eventTimeZone) ? (
            <Text style={styles.attendeeMeta}>
              {t.checkedInStatus}: {formatDateTime(state.ticket.checkedInAt, locale, eventTimeZone)}
            </Text>
          ) : null}
          <TouchableOpacity style={[styles.button, styles.nextButton]} onPress={resetScanner}>
            <Text style={styles.buttonText}>{t.scanNext}</Text>
          </TouchableOpacity>
        </SafeAreaView>
      )}

      {state.kind === 'recorded' && (
        <SafeAreaView style={styles.resultCard} edges={['bottom']}>
          <View style={[styles.statusBanner, styles.bannerWarn]}>
            <Text style={styles.statusText}>✅ {t.recordedOnRetryTitle}</Text>
          </View>
          <Text style={styles.attendeeMeta}>{t.recordedOnRetryBody}</Text>
          {formatDateTime(state.checkedInAt, locale, eventTimeZone) ? (
            <Text style={styles.attendeeMeta}>
              {t.firstCheckIn}: {formatDateTime(state.checkedInAt, locale, eventTimeZone)}
            </Text>
          ) : null}
          <TouchableOpacity style={[styles.button, styles.nextButton]} onPress={resetScanner}>
            <Text style={styles.buttonText}>{t.scanNext}</Text>
          </TouchableOpacity>
        </SafeAreaView>
      )}

      {state.kind === 'rejected' && (
        <SafeAreaView style={styles.resultCard} edges={['bottom']}>
          <View style={[styles.statusBanner, bannerStyle(state.reason)]}>
            <Text style={styles.statusText}>
              {bannerIcon(state.reason)} {state.title}
            </Text>
          </View>
          <Text style={styles.attendeeMeta}>{state.message}</Text>
          {duplicateTime ? (
            <Text style={styles.attendeeMeta}>
              {t.firstCheckIn}: {duplicateTime}
            </Text>
          ) : null}
          {state.hint ? <Text style={styles.hint}>{state.hint}</Text> : null}
          {state.retryPayload ? (
            <TouchableOpacity
              style={[styles.button, styles.nextButton, styles.retryButton]}
              onPress={() => retry(state.retryPayload!, state.uncertainSince)}>
              <Text style={styles.buttonText}>{t.retryCheckIn}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.button, state.retryPayload ? styles.secondaryAction : styles.nextButton]}
            onPress={resetScanner}>
            <Text style={styles.buttonText}>{t.scanNext}</Text>
          </TouchableOpacity>
        </SafeAreaView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#111827',
  },
  infoTitle: { color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 10 },
  infoText: { color: '#fff', fontSize: 16, textAlign: 'center', marginBottom: 20 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 16 : 8,
    zIndex: 10,
  },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  eventName: { color: '#d1d5db', fontSize: 13, maxWidth: 200 },
  headerLeftColumn: { flexDirection: 'column', alignItems: 'flex-start', gap: 6, flexShrink: 1 },
  headerRightGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backButtonUnder: {
    backgroundColor: 'rgba(17,24,39,0.72)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  backButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  iconButton: {
    backgroundColor: 'rgba(17,24,39,0.72)',
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  torchText: { fontSize: 16, textAlign: 'center' },
  overlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  scanFrame: { width: FRAME_SIZE, height: FRAME_SIZE, position: 'relative' },
  corner: { position: 'absolute', width: 32, height: 32, borderColor: '#22c55e' },
  cornerTopLeft: { top: 0, left: 0, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: 6 },
  cornerTopRight: { top: 0, right: 0, borderRightWidth: 4, borderTopWidth: 4, borderTopRightRadius: 6 },
  cornerBottomLeft: { bottom: 0, left: 0, borderLeftWidth: 4, borderBottomWidth: 4, borderBottomLeftRadius: 6 },
  cornerBottomRight: { bottom: 0, right: 0, borderRightWidth: 4, borderBottomWidth: 4, borderBottomRightRadius: 6 },
  hintText: {
    position: 'absolute',
    bottom: 84,
    alignSelf: 'center',
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    backgroundColor: 'rgba(17,24,39,0.78)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 14,
    zIndex: 10,
  },
  resultCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#111827',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 16,
    zIndex: 20,
  },
  button: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  loadingBox: {
    position: 'absolute',
    bottom: 84,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(17,24,39,0.82)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
    zIndex: 10,
  },
  loadingText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  statusBanner: {
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginTop: 16,
    marginBottom: 12,
  },
  bannerOk: { backgroundColor: '#166534' },
  bannerWarn: { backgroundColor: '#a16207' },
  bannerError: { backgroundColor: '#991b1b' },
  bannerNeutral: { backgroundColor: '#374151' },
  statusText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  attendeeName: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 4 },
  attendeeMeta: { color: '#d1d5db', fontSize: 14, marginTop: 2 },
  hint: { color: '#fde68a', fontSize: 13, lineHeight: 18, marginTop: 10 },
  nextButton: { marginTop: 16, paddingVertical: 14, backgroundColor: '#1f2937' },
  retryButton: { backgroundColor: '#1d4ed8', borderColor: '#1d4ed8' },
  secondaryAction: { marginTop: 10, paddingVertical: 12 },
});
