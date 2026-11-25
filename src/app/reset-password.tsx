import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { resetPassword } from '../api/registration';

export default function ResetPasswordScreen() {
  const { email: initialEmail = '' } = useLocalSearchParams<{ email: string }>();

  const [email, setEmail] = useState(initialEmail);
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmedEmail = email.trim();
    const trimmedToken = token.trim();

    if (!trimmedEmail || !trimmedToken || password.length < 8) {
      setError('Enter your email, reset code, and a password of at least 8 characters.');
      return;
    }

    setBusy(true);
    setError('');

    try {
      await resetPassword(trimmedEmail, trimmedToken, password);
      router.replace('/login');
    } catch (e: unknown) {
      const errorMessage =
        e instanceof Error ? e.message : 'Password reset failed';
      setError(errorMessage);
    } finally {
      setBusy(false);
    }
  }

  const fields = [
    {
      label: 'Email',
      value: email,
      onChangeText: setEmail,
      secureTextEntry: false,
      keyboardType: 'email-address' as const,
    },
    {
      label: 'Reset code',
      value: token,
      onChangeText: setToken,
      secureTextEntry: false,
      keyboardType: 'default' as const,
    },
    {
      label: 'New password',
      value: password,
      onChangeText: setPassword,
      secureTextEntry: true,
      keyboardType: 'default' as const,
    },
  ];

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 justify-center p-6">
        <Text className="mb-5 text-center text-2xl font-bold">
          Choose a new password
        </Text>

        {fields.map(({ label, value, onChangeText, secureTextEntry, keyboardType }) => (
          <TextInput
            key={label}
            className="mb-3 rounded-xl border border-slate-300 p-4"
            value={value}
            onChangeText={onChangeText}
            placeholder={label}
            secureTextEntry={secureTextEntry}
            autoCapitalize="none"
            keyboardType={keyboardType}
          />
        ))}

        {error ? (
          <Text className="mb-3 text-red-600">{error}</Text>
        ) : null}

        <Pressable
          disabled={busy}
          onPress={submit}
          className="items-center rounded-xl bg-blue-600 p-4"
        >
          <Text className="font-bold text-white">
            {busy ? 'Saving…' : 'Update password'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}