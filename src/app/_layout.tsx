import { Slot } from 'expo-router';
import { AuthProvider } from '../store/auth-context';
import { SelectedEventProvider } from '../store/selected-event-context';

export default function RootLayout() {
  return (
    <AuthProvider>
      <SelectedEventProvider>
        <Slot />
      </SelectedEventProvider>
    </AuthProvider>
  );
}