import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'expo-router';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Linking,
  Alert,
  Platform,
} from 'react-native';
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

const SCAN_COOLDOWN_MS = 1500;
const FRAME_SIZE = 250;

type ScannedData = {
  data: string;
  type: string;
};

export default function ScannerScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [scannedData, setScannedData] = useState<ScannedData | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const lastScanTimeRef = useRef(0);

  const handleBarcodeScanned = useCallback(
    ({ data, type }: BarcodeScanningResult) => {
      const now = Date.now();
      if (scanned || now - lastScanTimeRef.current < SCAN_COOLDOWN_MS) {
        return;
      }
      lastScanTimeRef.current = now;
      setScanned(true);
      setScannedData({ data, type });
    },
    [scanned]
  );

  const resetScanner = () => {
    setScanned(false);
    setScannedData(null);
  };

  const handleOpenLink = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Cannot open link', url);
      }
    } catch {
      Alert.alert('Error', 'Could not open the link.');
    }
  };

  const isUrl = (str: string) => /^https?:\/\//i.test(str);

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

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Camera Layer */}
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torchOn}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      />

      {/* Centered Scan Frame Overlay */}
      <View style={styles.overlayContainer} pointerEvents="none">
        <View style={styles.scanFrame}>
          <View style={[styles.corner, styles.cornerTopLeft]} />
          <View style={[styles.corner, styles.cornerTopRight]} />
          <View style={[styles.corner, styles.cornerBottomLeft]} />
          <View style={[styles.corner, styles.cornerBottomRight]} />
        </View>
      </View>

      {/* Header Bar */}
      <SafeAreaView style={styles.topBar} pointerEvents="box-none">
        <View style={styles.headerLeftColumn}>
          <Text style={styles.title}>QR Scanner</Text>
          <TouchableOpacity
            style={styles.backButtonUnder}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>‹ Back</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => setTorchOn((prev) => !prev)}
        >
          <Text style={styles.torchText}>{torchOn ? '🔦' : '💡'}</Text>
        </TouchableOpacity>
      </SafeAreaView>
      {!scanned && (
        <Text style={styles.hintText}>Align the QR code within the frame</Text>
      )}

      {/* Result Card */}
      {scanned && scannedData && (
        <SafeAreaView style={styles.resultCard}>
          <Text style={styles.resultLabel}>Scanned ({scannedData.type})</Text>
          <Text style={styles.resultData} numberOfLines={4}>
            {scannedData.data}
          </Text>
          <View style={styles.resultButtonRow}>
            {isUrl(scannedData.data) && (
              <TouchableOpacity
                style={[styles.button, styles.buttonPrimary]}
                onPress={() => handleOpenLink(scannedData.data)}
              >
                <Text style={styles.buttonText}>Open Link</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={resetScanner}
            >
              <Text style={styles.buttonText}>Scan Again</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#111',
  },
  infoText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
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
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  headerLeftColumn: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 6,
  },
  backButtonUnder: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  backButtonText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  iconButton: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  torchButton: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  torchButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
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
  scanFrame: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderColor: '#00E676',
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderLeftWidth: 4,
    borderTopWidth: 4,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderRightWidth: 4,
    borderTopWidth: 4,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderLeftWidth: 4,
    borderBottomWidth: 4,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderRightWidth: 4,
    borderBottomWidth: 4,
  },
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
    paddingBottom: Platform.OS === 'ios' ? 20 : 12,
    zIndex: 20,
  },
  resultLabel: {
    color: '#8e8e93',
    fontSize: 11,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  resultData: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 10,
  },
  resultButtonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonPrimary: {
    backgroundColor: '#007AFF',
    flex: 1,
  },
  buttonSecondary: {
    backgroundColor: '#3a3a3c',
    flex: 1,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});