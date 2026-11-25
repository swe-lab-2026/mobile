import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { ApiError } from '../api/client';
import { registerUser, resendVerification, verifyEmail } from '../api/registration';
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

type Step = 'form' | 'verify';

export default function RegisterScreen() {
  const params = useLocalSearchParams<{ email?: string; verify?: string }>();
  const { login } = useAuth();
  const { t } = useLanguage();

  const [step, setStep] = useState<Step>(params.verify ? 'verify' : 'form');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState(params.email ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [alreadyExists, setAlreadyExists] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // coming from the login screen with an unverified account: send a fresh code
  useEffect(() => {
    if (params.verify && params.email) {
      resendVerification(params.email)
        .then(() => setInfo(t.resent))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goBack() {
    if (step === 'verify' && !params.verify) {
      setStep('form');
      setError(null);
      setInfo(null);
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/login');
    }
  }

  async function handleRegister() {
    setError(null);
    setAlreadyExists(false);

    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password || !confirm) {
      setError(t.errFields);
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError(t.errEmail);
      return;
    }
    if (password.length < 8) {
      setError(t.errPasswordShort);
      return;
    }
    if (password !== confirm) {
      setError(t.errPasswordMatch);
      return;
    }

    setSubmitting(true);
    try {
      await registerUser({
        email: email.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      setStep('verify');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setAlreadyExists(true);
        setError(t.errExists);
      } else {
        setError(authErrorMessage(err, t));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify() {
    setError(null);
    setInfo(null);

    if (!/^\d{6}$/.test(code.trim())) {
      setError(t.errCode);
      return;
    }

    setSubmitting(true);
    try {
      await verifyEmail(email.trim(), code.trim());
    } catch (err) {
      setError(authErrorMessage(err, t));
      setSubmitting(false);
      return;
    }

    // verified: log in right away when we know the password
    try {
      if (password) {
        await login(email.trim(), password);
        router.replace('/events');
      } else {
        router.replace('/login');
      }
    } catch {
      router.replace('/login');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setError(null);
    setInfo(null);
    try {
      await resendVerification(email.trim());
      setInfo(t.resent);
    } catch (err) {
      setError(authErrorMessage(err, t));
    }
  }

  if (step === 'verify') {
    return (
      <AuthLayout onBack={goBack}>
        <Text style={authStyles.title}>{t.verifyTitle}</Text>
        <Text style={authStyles.subtitle}>
          {t.verifySubtitle} {email.trim()}
        </Text>

        <Field
          label={t.code}
          placeholder="123456"
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
          onSubmitEditing={handleVerify}
        />

        {error ? <Notice kind="error" text={error} /> : null}
        {info ? <Notice kind="info" text={info} /> : null}

        <PrimaryButton label={t.confirm} onPress={handleVerify} loading={submitting} />

        <View style={authStyles.centerLink}>
          <LinkText label={t.resend} onPress={handleResend} />
        </View>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout onBack={goBack}>
      <Text style={authStyles.title}>{t.registerTitle}</Text>
      <Text style={authStyles.subtitle}>{t.registerSubtitle}</Text>

      <View style={authStyles.row}>
        <View style={authStyles.half}>
          <Field
            label={t.firstName}
            value={firstName}
            onChangeText={setFirstName}
            autoCapitalize="words"
          />
        </View>
        <View style={authStyles.half}>
          <Field
            label={t.lastName}
            value={lastName}
            onChangeText={setLastName}
            autoCapitalize="words"
          />
        </View>
      </View>

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
      />
      <Field
        label={t.confirmPassword}
        placeholder="••••••••"
        value={confirm}
        onChangeText={setConfirm}
        secure
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={handleRegister}
      />

      {error ? <Notice kind="error" text={error} /> : null}

      {alreadyExists ? (
        <View style={{ marginBottom: 14 }}>
          <LinkText
            label={t.verifyNow}
            onPress={() => {
              setError(null);
              setAlreadyExists(false);
              resendVerification(email.trim())
                .then(() => setInfo(t.resent))
                .catch(() => {});
              setStep('verify');
            }}
          />
        </View>
      ) : null}

      <PrimaryButton label={t.createAccount} onPress={handleRegister} loading={submitting} />

      <SwitchRow
        text={t.haveAccount}
        link={t.login}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/login'))}
      />
    </AuthLayout>
  );
}