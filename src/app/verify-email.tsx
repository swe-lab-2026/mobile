import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { registrationApi } from '../api/registration';

export default function VerifyEmailScreen() {
  const { email: initialEmail = '' } = useLocalSearchParams<{ email: string }>();

  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [feedback, setFeedback] = useState('');
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function verify() {
    const trimmedEmail = email.trim();
    const trimmedCode = code.trim();

    if (!trimmedEmail || !trimmedCode) {
      setIsError(true);
      setFeedback('Enter your email address and verification code.');
      return;
    }

    setBusy(true);
    setFeedback('');
    setIsError(false);

    try {
      await registrationApi.verify(trimmedEmail, trimmedCode);
      router.replace('/login');
    } catch (e: unknown) {
      setIsError(true);
      setFeedback(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setIsError(true);
      setFeedback('Enter your email address first.');
      return;
    }

    setFeedback('');
    setIsError(false);

    try {
      await registrationApi.resend(trimmedEmail);
      setIsError(false);
      setFeedback('A new verification code was requested.');
    } catch (e: unknown) {
      setIsError(true);
      setFeedback(e instanceof Error ? e.message : 'Could not resend code');
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 justify-center p-6">
        <Text className="mb-2 text-center text-2xl font-bold">
          Verify your email
        </Text>

        <Text className="mb-5 text-center text-slate-500">
          Enter the code sent to your email address.
        </Text>

        <TextInput
          className="mb-3 rounded-xl border border-slate-300 p-4"
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <TextInput
          className="mb-3 rounded-xl border border-slate-300 p-4"
          value={code}
          onChangeText={setCode}
          placeholder="Verification code"
          keyboardType="number-pad"
        />

        {feedback ? (
          <Text
            className={`mb-3 text-center ${
              isError ? 'text-red-600' : 'text-emerald-600'
            }`}
          >
            {feedback}
          </Text>
        ) : null}

        <Pressable
          onPress={verify}
          disabled={busy}
          className="items-center rounded-xl bg-blue-600 p-4"
        >
          {busy ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="font-bold text-white">Verify email</Text>
          )}
        </Pressable>

        <Pressable onPress={resend}>
          <Text className="mt-4 text-center text-blue-700">Resend code</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}