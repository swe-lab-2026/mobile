import { useState } from 'react';
import { View, TextInput, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../store/auth-context';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError } from '../api/client';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'Invalid email or password.',
  EMAIL_NOT_VERIFIED: 'Please verify your email first (on the web app).',
  USER_BLOCKED: 'This account is blocked.',
  TOO_MANY_ATTEMPTS: 'Too many failed attempts. Try again in a few minutes.',
};

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
        await login(email.trim(), password);
        router.replace('/events');
    } catch (err) {
        setError((err instanceof ApiError && MESSAGES[err.code ?? '']) || 'Something went wrong. Please try again.');
    } finally {
        setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style= {{flex:1, backgroundColor: 'white'}}>
    <View className='flex-1 justify-center p-6 gap-3 bg-white'>
      <Text className='text-3xl font-semibold text-center'>Sign In</Text>

      <TextInput
        className='border border-gray-300 rounded-lg p-3 text-base'
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        className='border border-gray-300 rounded-lg p-3 text-base'
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error && <Text className="text-red-600 text-center">{error}</Text>}

      <Pressable 
      className={`rounded-lg p-3.5 items-center mt-2 ${submitting ? 'bg-gray-400' : 'bg-black'}`}
      onPress={handleSubmit} 
      disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text className='text-white font-semibold text-lg'>Log In</Text>}
      </Pressable>
    </View>
    </SafeAreaView>
  );
}
