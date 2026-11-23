import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import {
  authErrorMessage,
  AuthLayout,
  authStyles,
  Field,
  LinkText,
  Notice,
  PrimaryButton,
  SwitchRow,
} from '../components/AuthUI';
import { useAuth } from '../store/auth-context';
import { useLanguage } from '../store/language-context';

export default function LoginScreen() {
  const { login } = useAuth();
  const { t } = useLanguage();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notVerified, setNotVerified] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function goBack() {
    // go back if there is a previous screen, otherwise open the catalog (index)
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  async function handleSubmit() {
    setError(null);
    setNotVerified(false);

    if (!email.trim() || !password) {
      setError(t.errFields);
      return;
    }

    setSubmitting(true);
    try {
      await login(email.trim(), password);
      router.replace('/events');
    } catch (err) {
      setNotVerified((err as any)?.code === 'EMAIL_NOT_VERIFIED');
      setError(authErrorMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout onBack={goBack}>
      <Text style={authStyles.title}>{t.loginTitle}</Text>
      <Text style={authStyles.subtitle}>{t.loginSubtitle}</Text>

      <Field
        label={t.email}
        placeholder="name@example.com"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
      />
      <Field
        label={t.password}
        placeholder="••••••••"
        value={password}
        onChangeText={setPassword}
        secure
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="password"
        onSubmitEditing={handleSubmit}
        returnKeyType="go"
      />

      {error ? <Notice kind="error" text={error} /> : null}

      {notVerified ? (
        <View style={{ marginBottom: 14 }}>
          <LinkText
            label={t.verifyNow}
            onPress={() =>
              router.push({
                pathname: '/register',
                params: { email: email.trim(), verify: '1' },
              })
            }
          />
        </View>
      ) : null}

      <PrimaryButton label={t.login} onPress={handleSubmit} loading={submitting} />

      <SwitchRow
        text={t.noAccount}
        link={t.register}
        onPress={() => router.push('/register')}
      />
    </AuthLayout>
  );
}