import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { describeError } from '../api/errors';
import { resetPassword } from '../api/registration';
import { AuthLayout, authStyles, Field, Notice, PrimaryButton } from '../components/AuthUI';
import { notify } from '../components/dialogs';
import { useLanguage } from '../store/language-context';

export default function ResetPasswordScreen() {
  const { t } = useLanguage();
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const initialEmail = Array.isArray(params.email) ? params.email[0] : params.email;

  const [email, setEmail] = useState(initialEmail ?? '');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/login'));

  async function submit() {
    if (busy) return;
    const trimmedEmail = email.trim();
    const trimmedToken = token.trim();

    if (!trimmedEmail || !trimmedToken || password.length < 8) {
      setError(t.errResetFields);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await resetPassword(trimmedEmail, trimmedToken, password);
      notify(t.successTitle, t.passwordUpdated);
      router.replace('/login');
    } catch (e) {
      setError(describeError(e, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout onBack={back}>
      <Text style={authStyles.title}>{t.newPasswordTitle}</Text>
      <Text style={authStyles.subtitle}>{t.newPasswordSubtitle}</Text>

      <Field
        label={t.email}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
      />
      <Field
        label={t.resetCode}
        value={token}
        onChangeText={setToken}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Field
        label={t.newPassword}
        placeholder="••••••••"
        value={password}
        onChangeText={setPassword}
        secure
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={submit}
      />

      {error ? <Notice kind="error" text={error} /> : null}

      <PrimaryButton label={t.updatePassword} onPress={submit} loading={busy} />
    </AuthLayout>
  );
}
