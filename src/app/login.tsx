import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Redirect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError } from '../api/client';
import { useAuth } from '../store/auth-context';

function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'INVALID_CREDENTIALS':
        return 'Invalid email or password.';
      case 'EMAIL_NOT_VERIFIED':
        return 'Please verify your email before signing in.';
      case 'USER_BLOCKED':
        return 'This account is blocked. Contact support.';
      case 'TOO_MANY_ATTEMPTS':
        return 'Too many failed attempts. Please try again later.';
      case 'NETWORK_ERROR':
        return 'Cannot reach the server. Check your connection and API URL.';
      default:
        return error.message;
    }
  }
  return 'Something went wrong. Please try again.';
}

export default function LoginScreen() {
  const { login, isAuthenticated, isInitializing, initializationError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (submitting) return;

    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      router.replace('/events');
    } catch (err) {
      setError(loginErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (isInitializing) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  if (isAuthenticated) {
    return <Redirect href="/events" />;
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="flex-1 justify-center gap-3 p-6">
          <Text className="text-center text-3xl font-semibold">Sign In</Text>

          {initializationError ? (
            <Text className="text-center text-sm text-amber-600">{initializationError}</Text>
          ) : null}

          <TextInput
            className="rounded-lg border border-gray-300 p-3 text-base"
            placeholder="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            editable={!submitting}
          />
          <TextInput
            className="rounded-lg border border-gray-300 p-3 text-base"
            placeholder="Password"
            secureTextEntry
            autoComplete="current-password"
            value={password}
            onChangeText={setPassword}
            editable={!submitting}
            onSubmitEditing={handleSubmit}
          />

          {error ? <Text className="text-center text-red-600">{error}</Text> : null}

          <Pressable
            className={`mt-2 items-center rounded-lg p-3.5 ${
              submitting ? 'bg-gray-400' : 'bg-black'
            }`}
            onPress={handleSubmit}
            disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-lg font-semibold text-white">Log In</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
