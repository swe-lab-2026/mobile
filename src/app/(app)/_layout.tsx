import { Redirect, Slot } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../../store/auth-context';

export default function AppGroupLayout() {
  const { isAuthenticated, isInitializing } = useAuth();

  if (isInitializing) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  return <Slot />;
}
