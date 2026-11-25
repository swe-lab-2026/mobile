import { ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { describeError } from '../api/errors';
import { colors, shadow } from '../constants/theme';
import { Dict, useLanguage } from '../store/language-context';
import { LanguagePicker } from './LanguagePicker';
import { Logo } from './Logo';

/** Localized message for auth/profile errors (network, timeout, backend codes). */
export function authErrorMessage(err: unknown, t: Dict): string {
  return describeError(err, t);
}

export function AuthLayout({ children, onBack }: { children: ReactNode; onBack: () => void }) {
  const { t } = useLanguage();

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topRow}>
            <TouchableOpacity activeOpacity={0.7} onPress={onBack} style={styles.backPill}>
              <Text style={styles.backText}>‹ {t.back}</Text>
            </TouchableOpacity>
            <LanguagePicker />
          </View>

          <View style={styles.logoWrap}>
            <Logo />
          </View>

          <View style={styles.cardWrap}>
            <View style={styles.card}>{children}</View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Field({
  label,
  secure,
  big,
  ...props
}: TextInputProps & { label: string; secure?: boolean; big?: boolean }) {
  const { t } = useLanguage();
  const [hidden, setHidden] = useState(true);
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={[styles.label, big && styles.labelCenter]}>{label}</Text>
      <View style={[styles.inputRow, big && styles.inputRowBig, focused && styles.inputFocused]}>
        <TextInput
          {...props}
          style={[styles.input, big && styles.inputBig]}
          placeholderTextColor="#9ca3af"
          secureTextEntry={secure && hidden}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {secure ? (
          <TouchableOpacity activeOpacity={0.7} onPress={() => setHidden((h) => !h)} hitSlop={10}>
            <Text style={styles.toggle}>{hidden ? t.show : t.hide}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  loading,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={loading}
      style={[styles.button, loading && styles.buttonDim]}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={styles.buttonText}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

export type NoticeKind = 'error' | 'info' | 'success';

export function Notice({ kind, text }: { kind: NoticeKind; text: string }) {
  const box =
    kind === 'error' ? styles.noticeError : kind === 'success' ? styles.noticeSuccess : styles.noticeInfo;
  const textStyle =
    kind === 'error'
      ? styles.noticeTextError
      : kind === 'success'
        ? styles.noticeTextSuccess
        : styles.noticeTextInfo;
  return (
    <View style={[styles.notice, box]}>
      <Text style={[styles.noticeText, textStyle]}>
        {text}
      </Text>
    </View>
  );
}

export function LinkText({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} hitSlop={8}>
      <Text style={styles.linkText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function SwitchRow({
  text,
  link,
  onPress,
}: {
  text: string;
  link: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.switchRow}>
      <Text style={styles.switchText}>{text} </Text>
      <LinkText label={link} onPress={onPress} />
    </View>
  );
}

export const authStyles = StyleSheet.create({
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
    color: colors.ink,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 24,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
    textAlign: 'center',
  },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  centerLink: { alignItems: 'center', marginTop: 18 },
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 32 },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  backPill: {
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: { fontSize: 14, fontWeight: '700', color: colors.text },

  logoWrap: { alignItems: 'center', marginTop: 28, marginBottom: 24 },

  cardWrap: { alignItems: 'center' },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: colors.card,
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: '#eef0f3',
    ...shadow,
  },

  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  labelCenter: { textAlign: 'center' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 54,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: '#fafafa',
  },
  inputRowBig: { height: 68, borderRadius: 18 },
  inputFocused: { borderColor: colors.brand, backgroundColor: colors.card },
  input: { flex: 1, fontSize: 16, color: colors.ink, paddingVertical: 0 },
  inputBig: { fontSize: 30, fontWeight: '800', letterSpacing: 10, textAlign: 'center' },
  toggle: { fontSize: 13, fontWeight: '700', color: colors.brand, marginLeft: 10 },

  button: {
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    alignSelf: 'stretch',
  },
  buttonDim: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' },

  notice: { borderRadius: 14, padding: 12, marginBottom: 14 },
  noticeError: { backgroundColor: colors.dangerSoft },
  noticeInfo: { backgroundColor: colors.brandSoft },
  noticeText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  noticeTextError: { color: colors.danger },
  noticeTextInfo: { color: colors.brandDark },
  noticeSuccess: { backgroundColor: '#dcfce7' },
  noticeTextSuccess: { color: '#166534' },

  linkText: { fontSize: 14, fontWeight: '700', color: colors.brand },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22,
  },
  switchText: { fontSize: 14, color: colors.muted },
});