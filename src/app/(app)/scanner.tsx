import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError } from '../../api/client';
import { checkInTicket } from '../../api/events';
import { LanguagePicker } from '../../components/LanguagePicker';
import { Lang, useLanguage } from '../../store/language-context';
import type { CheckedInTicket } from '../../types/event';

const SCAN_COOLDOWN_MS = 1500;
const FRAME_SIZE = 250;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BARCODE_SETTINGS = { barcodeTypes: ['qr' as const] };
const LOCALES: Record<Lang, string> = {
  ru: 'ru-RU',
  kk: 'kk-KZ',
  en: 'en-GB',
};

type ScanState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; ticket: CheckedInTicket }
  | { kind: 'duplicate'; checkedInAt?: string }
  | { kind: 'error'; message: string };

function formatDateTime(value: string | null | undefined, locale: string) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function resolveScanError(error: unknown, t: Record<string, any>): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'INVALID_TICKET_QR':
        return t.errInvalidTicketQr ?? 'This QR code is not a valid ticket.';
      case 'TICKET_NOT_FOUND':
        return t.errTicketNotFound ?? 'Ticket not found for this event.';
      case 'TICKET_NOT_VALID':
        return t.errTicketNotValid ?? 'This ticket is not valid (cancelled or refunded).';
      case 'INSUFFICIENT_EVENT_PERMISSIONS':
        return t.errInsufficientPermissions ?? 'You are not allowed to check in for this event.';
      case 'NETWORK_ERROR':
        return t.errNetwork ?? 'Cannot reach the server. Check your connection.';
    }
    return error.message;
  }
  return t.errNetwork ?? 'Cannot reach the server. Check your connection.';
}

export default function ScannerScreen() {
  const router = useRouter();
  const { t, lang } = useLanguage();
  const dict = t as Record<string, any>;
  const locale = LOCALES[lang];

  const params = useLocalSearchParams<{ eventId?: string | string[] }>();
  const eventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;

  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<ScanState>({ kind: 'idle' });
  const [torchOn, setTorchOn] = useState(false);

  const lastScanTimeRef = useRef(0);
  const busyRef = useRef(false);

  const handleBarcodeScanned = useCallback(
    async ({ data }: BarcodeScanningResult) => {
      const payload = data?.trim();
      if (!payload) return;

      const now = Date.now();
      if (busyRef.current || now - lastScanTimeRef.current < SCAN_COOLDOWN_MS) return;

      if (!eventId || !UUID_PATTERN.test(eventId)) {
        lastScanTimeRef.current = now;
        setState({
          kind: 'error',
          message:
            dict.errNoEventSelected ??
            'No valid event selected. Open the scanner from an event.',
        });
        return;
      }

      busyRef.current = true;
      lastScanTimeRef.current = now;
      setState({ kind: 'loading' });

      try {
        const ticket = await checkInTicket(eventId, payload);
        setState({ kind: 'success', ticket });
      } catch (e) {
        if (e instanceof ApiError && e.code === 'TICKET_ALREADY_CHECKED_IN') {
          setState({
            kind: 'duplicate',
            checkedInAt: e.details?.checked_in_at as string | undefined,
          });
        } else {
          setState({ kind: 'error', message: resolveScanError(e, dict) });
        }
      } finally {
        busyRef.current = false;
      }
    },
    [eventId, dict],
  );

  const resetScanner = () => {
    busyRef.current = false;
    setState({ kind: 'idle' });
  };

  if (!permission) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color="#fff" style={{ marginBottom: 12 }} />
        <Text style={styles.infoText}>
          {dict.loadingPermissions ?? 'Loading camera permissions…'}
        </Text>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.infoText}>
          {dict.cameraPermissionRequired ??
            'We need your permission to use the camera to scan QR codes.'}
        </Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>
            {dict.grantPermission ?? 'Grant Permission'}
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const scanning = state.kind === 'idle';
  const duplicateTime =
    state.kind === 'duplicate' ? formatDateTime(state.checkedInAt, locale) : null;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <CameraView
        style={StyleSheet.absoluteFill}
        active={scanning}
        autofocus="on"
        facing="back"
        enableTorch={torchOn}
        barcodeScannerSettings={BARCODE_SETTINGS}
        onBarcodeScanned={scanning ? handleBarcodeScanned : undefined}
        onMountError={(e) =>
          setState({
            kind: 'error',
            message: e.message || (dict.cameraMountError ?? 'Could not start the camera.'),
          })
        }
      />

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
          <Text style={styles.title}>{dict.scannerTitle ?? 'Check-in Scanner'}</Text>
          <TouchableOpacity style={styles.backButtonUnder} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>‹ {t.back}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.headerRightGroup}>
          <LanguagePicker />
          <TouchableOpacity style={styles.iconButton} onPress={() => setTorchOn((p) => !p)}>
            <Text style={styles.torchText}>{torchOn ? '🔦' : '💡'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {scanning && (
        <Text style={styles.hintText}>
          {dict.alignQrHint ?? 'Align the ticket QR code within the frame'}
        </Text>
      )}

      {state.kind === 'loading' && (
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.loadingText}>
            {dict.checkingTicket ?? 'Checking ticket…'}
          </Text>
        </View>
      )}

      {state.kind === 'success' && (
        <SafeAreaView style={styles.resultCard} edges={['bottom']}>
          <View style={[styles.statusBanner, styles.bannerOk]}>
            <Text style={styles.statusText}>✅ {dict.checkedInStatus ?? 'Checked in'}</Text>
          </View>
          <Text style={styles.attendeeName}>
            {state.ticket.attendeeName ?? (dict.unnamedAttendee ?? 'Attendee')}
          </Text>
          <Text style={styles.attendeeMeta}>{state.ticket.attendeeEmail}</Text>
          <Text style={styles.attendeeMeta}>
            {state.ticket.ticketType} · #{state.ticket.orderNumber}
          </Text>
          <TouchableOpacity style={[styles.button, styles.nextButton]} onPress={resetScanner}>
            <Text style={styles.buttonText}>{dict.scanNext ?? 'Scan Next'}</Text>
          </TouchableOpacity>
        </SafeAreaView>
      )}

      {state.kind === 'duplicate' && (
        <SafeAreaView style={styles.resultCard} edges={['bottom']}>
          <View style={[styles.statusBanner, styles.bannerWarn]}>
            <Text style={styles.statusText}>
              ⚠️ {dict.alreadyCheckedIn ?? 'Already checked in'}
            </Text>
          </View>
          {duplicateTime ? (
            <Text style={styles.attendeeMeta}>
              {dict.firstCheckIn ?? 'First check-in'}: {duplicateTime}
            </Text>
          ) : null}
          <TouchableOpacity style={[styles.button, styles.nextButton]} onPress={resetScanner}>
            <Text style={styles.buttonText}>{dict.scanNext ?? 'Scan Next'}</Text>
          </TouchableOpacity>
        </SafeAreaView>
      )}

      {state.kind === 'error' && (
        <SafeAreaView style={styles.resultCard} edges={['bottom']}>
          <View style={[styles.statusBanner, styles.bannerError]}>
            <Text style={styles.statusText}>
              ❌ {dict.checkInFailed ?? 'Check-in failed'}
            </Text>
          </View>
          <Text style={styles.attendeeMeta}>{state.message}</Text>
          <TouchableOpacity style={[styles.button, styles.nextButton]} onPress={resetScanner}>
            <Text style={styles.buttonText}>{t.retry}</Text>
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
  headerLeftColumn: { flexDirection: 'column', alignItems: 'flex-start', gap: 6 },
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
  statusText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  attendeeName: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 4 },
  attendeeMeta: { color: '#d1d5db', fontSize: 14, marginTop: 2 },
  nextButton: { marginTop: 16, paddingVertical: 14, backgroundColor: '#1f2937' },
});