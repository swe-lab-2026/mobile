import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../store/auth-context';

export default function AppLayout() {
  const auth: any = useAuth();
  const loading = auth.isLoading ?? auth.loading ?? false;
  const loggedIn = Boolean(auth.user || auth.isAuthenticated || auth.accessToken || auth.token);

  if (loading) return null;
  if (!loggedIn) return <Redirect href="/login" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}