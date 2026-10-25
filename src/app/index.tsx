import { Redirect } from 'expo-router';
import { useAuth } from '../store/auth-context';

export default function Index() {
  const { isLoading, isAuthenticated } = useAuth();
  if (isLoading) return null;
  return <Redirect href={isAuthenticated ? '/events' : '/login'} />;
}