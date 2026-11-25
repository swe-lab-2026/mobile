import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { ApiError } from '../api/client';
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

function resolveLoginError(error: unknown, t: ReturnType<typeof useLanguage>['t']): string {
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
    }
  }
  return authErrorMessage(error, t);
}

export default function LoginScreen() {
  const { login, isAuthenticated, isInitializing, initializationError } = useAuth();
  const { t } = useLanguage();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [notVerified, setNotVerified] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/events');
  }

  async function handleSubmit() {
    if (submitting) return;

    setError(null);
    setStatusMessage(null);
    setNotVerified(false);

    if (!email.trim() || !password) {
      setError(t.errFields);
      return;
    }

    setSubmitting(true);
    try {
      await login(email.trim(), password);
      setStatusMessage('Logged in');
      router.replace('/events');
    } catch (err) {
      setNotVerified((err as any)?.code === 'EMAIL_NOT_VERIFIED');
      setError(resolveLoginError(err, t));
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

      {initializationError ? <Notice kind="error" text={initializationError} /> : null}

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

      {statusMessage ? <Notice kind="success" text={statusMessage} /> : null}
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