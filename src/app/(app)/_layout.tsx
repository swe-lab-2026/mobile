import { Redirect, Slot } from 'expo-router';
import { useAuth } from '../../store/auth-context';

export default function AppGroupLayout() {
  const { isAuthenticated, isEventAdmin } = useAuth();

  // Allow only the event admin to access the events list, details and QR scanner
  // Redirects other user to login page for now
  if (!isAuthenticated || !isEventAdmin) {
    return <Redirect href="/login" />;
  }

  return <Slot />;
}
