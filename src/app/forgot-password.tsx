import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { registrationApi } from '../api/registration';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setMessage('Enter your email address.');
      return;
    }

    setMessage('');
    setBusy(true);

    try {
      await registrationApi.requestReset(trimmedEmail);
      router.push({
        pathname: '../reset-password',
        params: { email: trimmedEmail },
      });
    } catch (e: unknown) {
      const errorMessage =
        e instanceof Error ? e.message : 'Could not request reset';
      setMessage(errorMessage);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 justify-center p-6">
        <Text className="mb-5 text-center text-2xl font-bold">
          Reset password
        </Text>

        <TextInput
          className="mb-3 rounded-xl border border-slate-300 p-4"
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
        />

        {message ? (
          <Text className="mb-3 text-red-600">{message}</Text>
        ) : null}

        <Pressable
          disabled={busy}
          onPress={submit}
          className="items-center rounded-xl bg-blue-600 p-4"
        >
          <Text className="font-bold text-white">
            {busy ? 'Sending…' : 'Send reset code'}
          </Text>
        </Pressable>

        <Pressable onPress={() => router.back()}>
          <Text className="mt-4 text-center text-blue-700">Back</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}