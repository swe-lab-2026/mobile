import { Stack } from 'expo-router';
import '../global.css'; // keep whatever import you already have for NativeWind
import { AuthProvider } from '../store/auth-context';
import { LanguageProvider } from '../store/language-context';
import { SelectedEventProvider } from '../store/selected-event-context';

export default function RootLayout() {
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