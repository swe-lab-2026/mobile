import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { describeError } from '../api/errors';
import { requestPasswordReset } from '../api/registration';
import { AuthLayout, authStyles, Field, Notice, PrimaryButton } from '../components/AuthUI';
import { useLanguage } from '../store/language-context';

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

export default function ForgotPasswordScreen() {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/login'));

  async function submit() {
    if (busy) return;
    const trimmedEmail = email.trim();
    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setError(t.errEmail);
      return;
    }

    setError(null);
    setBusy(true);
    try {
      await requestPasswordReset(trimmedEmail);
      router.push({ pathname: '/reset-password', params: { email: trimmedEmail } });
    } catch (e) {
      setError(describeError(e, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout onBack={back}>
      <Text style={authStyles.title}>{t.resetTitle}</Text>
      <Text style={authStyles.subtitle}>{t.resetSubtitle}</Text>

      <Field
        label={t.email}
        placeholder="name@example.com"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        onSubmitEditing={submit}
        returnKeyType="send"
      />

      {error ? <Notice kind="error" text={error} /> : null}

      <PrimaryButton label={t.sendResetCode} onPress={submit} loading={busy} />
    </AuthLayout>
  );
}
