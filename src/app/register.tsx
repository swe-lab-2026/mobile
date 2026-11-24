import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError } from '../api/client';
import { registrationApi } from '../api/registration';

export default function RegisterScreen() {
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError('');

    if (!first.trim() || !last.trim() || !email.trim() || password.length < 8) {
      setError('Complete all fields. Password must be at least 8 characters.');
      return;
    }

    setBusy(true);
    try {
      await registrationApi.register({
        email: email.trim(),
        password,
        first_name: first.trim(),
        last_name: last.trim(),
      });

      router.replace({
        pathname: '../verify-email',
        params: { email: email.trim() },
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create account');
    } finally {
      setBusy(false);
    }
  }

  const fields = [
    { label: 'First name', value: first, setter: setFirst },
    { label: 'Last name', value: last, setter: setLast },
    { label: 'Email', value: email, setter: setEmail },
    { label: 'Password', value: password, setter: setPassword },
  ];

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-center p-6"
      >
        <Text className="mb-6 text-center text-3xl font-bold">
          Create account
        </Text>

        {fields.map(({ label, value, setter }) => (
          <TextInput
            key={label}
            className="mb-3 rounded-xl border border-slate-300 p-4 text-base"
            placeholder={label}
            value={value}
            onChangeText={setter}
            secureTextEntry={label === 'Password'}
            autoCapitalize={label === 'Email' || label === 'Password' ? 'none' : 'words'}
            keyboardType={label === 'Email' ? 'email-address' : 'default'}
          />
        ))}

        {error ? (
          <Text className="mb-3 text-center text-red-600">{error}</Text>
        ) : null}

        <Pressable
          disabled={busy}
          onPress={submit}
          className="items-center rounded-xl bg-blue-600 p-4"
        >
          {busy ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="font-bold text-white">Create account</Text>
          )}
        </Pressable>

        <Pressable onPress={() => router.replace('/login')}>
          <Text className="mt-4 text-center text-blue-700">Back to login</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}