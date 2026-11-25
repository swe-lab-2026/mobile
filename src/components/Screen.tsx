import { ReactNode } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, shadow } from '../constants/theme';
import { AppHeader } from './AppHeader';

type Props = {
  title?: string;
  subtitle?: string;
  backLabel?: string;
  onBack?: () => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  children: ReactNode;
};

export function Screen({ title, subtitle, backLabel, onBack, refreshing, onRefresh, children }: Props) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <AppHeader />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
            ) : undefined
          }
        >
          {onBack ? (
            <TouchableOpacity activeOpacity={0.7} onPress={onBack} style={styles.back}>
              <Text style={styles.backText}>‹ {backLabel}</Text>
            </TouchableOpacity>
          ) : null}
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <View style={styles.body}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Card({
  title,
  subtitle,
  badge,
  children,
}: {
  title?: string;
  subtitle?: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={styles.card}>
      {title ? (
        <View style={styles.cardHead}>
          <View style={styles.flex}>
            <Text style={styles.cardTitle}>{title}</Text>
            {subtitle ? <Text style={styles.cardSub}>{subtitle}</Text> : null}
          </View>
          {badge}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Badge({ text, tone }: { text: string; tone: 'green' | 'gray' | 'amber' | 'red' }) {
  const t = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text style={[styles.badgeText, { color: t.fg }]}>{text}</Text>
    </View>
  );
}

const TONES = {
  green: { bg: colors.brandSoft, fg: colors.brandDark },
  gray: { bg: '#f1f2f4', fg: colors.muted },
  amber: { bg: '#fef3c7', fg: '#92400e' },
  red: { bg: colors.dangerSoft, fg: colors.danger },
};

export function statusTone(status: string): 'green' | 'gray' | 'amber' | 'red' {
  switch (status) {
    case 'PAID':
    case 'VALID':
    case 'VERIFIED':
      return 'green';
    case 'PENDING':
      return 'amber';
    case 'CANCELLED':
    case 'REJECTED':
      return 'red';
    default:
      return 'gray';
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  back: { alignSelf: 'flex-start', marginTop: 16, paddingVertical: 6 },
  backText: { fontSize: 15, fontWeight: '600', color: colors.muted },
  title: { marginTop: 24, fontSize: 30, fontWeight: '800', letterSpacing: -0.8, color: colors.ink },
  subtitle: { marginTop: 8, fontSize: 15, lineHeight: 22, color: colors.muted },
  body: { marginTop: 20 },

  card: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#eef0f3',
    ...shadow,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16, gap: 10 },
  cardTitle: { fontSize: 20, fontWeight: '800', color: colors.ink },
  cardSub: { marginTop: 4, fontSize: 14, lineHeight: 20, color: colors.muted },

  badge: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 10 },
  badgeText: { fontSize: 12, fontWeight: '700' },
});