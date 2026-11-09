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
import type { CheckedInTicket } from '../../types/event';

const SCAN_COOLDOWN_MS = 1500;
const FRAME_SIZE = 250;

type ScanState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; ticket: CheckedInTicket }
  | { kind: 'duplicate'; checkedInAt?: string }
  | { kind: 'error'; message: string };

function formatDateTime(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'INVALID_TICKET_QR':
        return 'This QR code is not a valid ticket.';
      case 'TICKET_NOT_FOUND':
        return 'Ticket not found for this event.';
      case 'TICKET_NOT_VALID':
        return 'This ticket is not valid (cancelled or refunded).';
      case 'INSUFFICIENT_EVENT_PERMISSIONS':
        return 'You are not allowed to check in for this event.';
    }
    return e.message;
  }
  return 'Cannot reach the server. Check your connection.';
}

export default function ScannerScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<ScanState>({ kind: 'idle' });
  const [torchOn, setTorchOn] = useState(false);
  const lastScanTimeRef = useRef(0);
  const busyRef = useRef(false);

  const handleBarcodeScanned = useCallback(
    async ({ data }: BarcodeScanningResult) => {
      const now = Date.now();
      if (busyRef.current || now - lastScanTimeRef.current < SCAN_COOLDOWN_MS) return;
      lastScanTimeRef.current = now;
      busyRef.current = true;

      if (!eventId) {
        setState({ kind: 'error', message: 'No event selected. Open the scanner from an event.' });
        return;
      }

      setState({ kind: 'loading' });
      try {
        const ticket = await checkInTicket(eventId, data);
        setState({ kind: 'success', ticket });
      } catch (e) {
        if (e instanceof ApiError && e.code === 'TICKET_ALREADY_CHECKED_IN') {
          setState({
            kind: 'duplicate',
            checkedInAt: e.details?.checked_in_at as string | undefined,
          });
        } else {
          setState({ kind: 'error', message: errorMessage(e) });
        }
      }
    },
    [eventId]
  );

  const resetScanner = () => {
    busyRef.current = false;
    setState({ kind: 'idle' });
  };

  if (!permission) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.infoText}>Loading camera permissions…</Text>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.infoText}>
          We need your permission to use the camera to scan QR codes.
        </Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const scanning = state.kind === 'idle';

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torchOn}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanning ? handleBarcodeScanned : undefined}
      />

      <View style={styles.overlayContainer} pointerEvents="none">
        <View style={styles.scanFrame}>
          <View style={[styles.corner, styles.cornerTopLeft]} />
          <View style={[styles.corner, styles.cornerTopRight]} />
          <View style={[styles.corner, styles.cornerBottomLeft]} />
          <View style={[styles.corner, styles.cornerBottomRight]} />
        </View>
      </View>

      <SafeAreaView style={styles.topBar} pointerEvents="box-none">
        <View style={styles.headerLeftColumn}>
          <Text style={styles.title}>Check-in Scanner</Text>
          <TouchableOpacity style={styles.backButtonUnder} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>‹ Back</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.iconButton} onPress={() => setTorchOn((p) => !p)}>
          <Text style={styles.torchText}>{torchOn ? '🔦' : '💡'}</Text>
        </TouchableOpacity>
      </SafeAreaView>

      {scanning && <Text style={styles.hintText}>Align the ticket QR code within the frame</Text>}

      {state.kind === 'loading' && (
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.loadingText}>Checking ticket…</Text>
        </View>
      )}

      {state.kind === 'success' && (
        <SafeAreaView style={styles.resultCard} edges={['bottom']}>
          <View style={[styles.statusBanner, styles.bannerOk]}>
            <Text style={styles.statusText}>✅ Checked in</Text>
          </View>
          <Text style={styles.attendeeName}>{state.ticket.attendeeName ?? 'Attendee'}</Text>
          <Text style={styles.attendeeMeta}>{state.ticket.attendeeEmail}</Text>
          <Text style={styles.attendeeMeta}>
            {state.ticket.ticketType} · Order #{state.ticket.orderNumber}
          </Text>
          <TouchableOpacity style={[styles.button, styles.nextButton]} onPress={resetScanner}>
            <Text style={styles.buttonText}>Scan Next</Text>
          </TouchableOpacity>
        </SafeAreaView>
      )}

      {state.kind === 'duplicate' && (
        <SafeAreaView style={styles.resultCard} edges={['bottom']}>
          <View style={[styles.statusBanner, styles.bannerWarn]}>
            <Text style={styles.statusText}>⚠️ Already checked in</Text>
          </View>
          {formatDateTime(state.checkedInAt) ? (
            <Text style={styles.attendeeMeta}>
              First check-in: {formatDateTime(state.checkedInAt)}
            </Text>
          ) : null}
          <TouchableOpacity style={[styles.button, styles.nextButton]} onPress={resetScanner}>
            <Text style={styles.buttonText}>Scan Next</Text>
          </TouchableOpacity>
        </SafeAreaView>
      )}

      {state.kind === 'error' && (
        <SafeAreaView style={styles.resultCard} edges={['bottom']}>
          <View style={[styles.statusBanner, styles.bannerError]}>
            <Text style={styles.statusText}>❌ Check-in failed</Text>
          </View>
          <Text style={styles.attendeeMeta}>{state.message}</Text>
          <TouchableOpacity style={[styles.button, styles.nextButton]} onPress={resetScanner}>
            <Text style={styles.buttonText}>Try Again</Text>
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
    backgroundColor: '#111',
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
    paddingTop: Platform.OS === 'android' ? 16 : 0,
    zIndex: 10,
  },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  headerLeftColumn: { flexDirection: 'column', alignItems: 'flex-start', gap: 6 },
  backButtonUnder: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  backButtonText: { color: '#007AFF', fontSize: 14, fontWeight: '600' },
  iconButton: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  torchText: { color: '#333', fontSize: 15, fontWeight: '600', textAlign: 'center' },
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
  corner: { position: 'absolute', width: 32, height: 32, borderColor: '#00E676' },
  cornerTopLeft: { top: 0, left: 0, borderLeftWidth: 4, borderTopWidth: 4 },
  cornerTopRight: { top: 0, right: 0, borderRightWidth: 4, borderTopWidth: 4 },
  cornerBottomLeft: { bottom: 0, left: 0, borderLeftWidth: 4, borderBottomWidth: 4 },
  cornerBottomRight: { bottom: 0, right: 0, borderRightWidth: 4, borderBottomWidth: 4 },
  hintText: {
    position: 'absolute',
    bottom: 80,
    alignSelf: 'center',
    color: '#fff',
    fontSize: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  resultCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 12,
    zIndex: 20,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  loadingBox: {
    position: 'absolute',
    bottom: 80,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
  },
  loadingText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  statusBanner: {
    borderRadius: 10,
    paddingVertical: 8,
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
  nextButton: { marginTop: 16, paddingVertical: 14 },
});