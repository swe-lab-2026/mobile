import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { ApiError } from '../api/client';
import { describeError } from '../api/errors';
import {
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
  const { login, isAuthenticated, isInitializing, initializationError } = useAuth();
  const { t } = useLanguage();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notVerified, setNotVerified] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/events');
  }

  async function handleSubmit() {
    if (submitting) return;

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
      setNotVerified(err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED');
      setError(describeError(err, t));
    } finally {
      setSubmitting(false);
    }
  }

  if (isInitializing) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (isAuthenticated) {
    return <Redirect href="/events" />;
  }

  return (
    <AuthLayout onBack={goBack}>
      <Text style={authStyles.title}>{t.loginTitle}</Text>
      <Text style={authStyles.subtitle}>{t.loginSubtitle}</Text>

      {initializationError ? <Notice kind="error" text={t.errNetwork} /> : null}

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

      <View style={{ marginBottom: 14, alignItems: 'flex-end' }}>
        <LinkText label={t.forgotPassword} onPress={() => router.push('/forgot-password')} />
      </View>

      <PrimaryButton label={t.login} onPress={handleSubmit} loading={submitting} />

      <SwitchRow
        text={t.noAccount}
        link={t.register}
        onPress={() => router.push('/register')}
      />
    </AuthLayout>
  );
}