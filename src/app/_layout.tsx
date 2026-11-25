import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';
import '../global.css'; // keep whatever import you already have for NativeWind
import { getApiConfigError } from '../api/client';
import { AuthProvider } from '../store/auth-context';
import { LanguageProvider } from '../store/language-context';
import { SelectedEventProvider } from '../store/selected-event-context';

// Evaluated once: EXPO_PUBLIC_* values are inlined at build time.
const API_CONFIG_ERROR = getApiConfigError();

function ConfigErrorScreen({ message }: { message: string }) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>App is not configured</Text>
      <Text style={styles.body}>{message}</Text>
      <Text style={styles.hint}>
        Set EXPO_PUBLIC_API_BASE_URL (see .env.example) and rebuild the app.
      </Text>
    </ScrollView>
  );
}

export default function RootLayout() {
  if (API_CONFIG_ERROR) {
    return <ConfigErrorScreen message={API_CONFIG_ERROR} />;
  }

  return (
    <LanguageProvider>
      <AuthProvider>
        <SelectedEventProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </SelectedEventProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 12 },
  body: { fontSize: 15, lineHeight: 22, color: '#991b1b', marginBottom: 12 },
  hint: { fontSize: 14, lineHeight: 20, color: '#6b7280' },
});
