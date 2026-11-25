import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/theme';
import { LANGUAGES, useLanguage } from '../store/language-context';

export function LanguagePicker() {
  const insets = useSafeAreaInsets();
  const { lang, setLang } = useLanguage();
  const [open, setOpen] = useState(false);
  const current = LANGUAGES.find((l) => l.code === lang);

  return (
    <>
      <TouchableOpacity activeOpacity={0.7} onPress={() => setOpen(true)} style={styles.pill}>
        <Text style={styles.pillText}>{current?.label}</Text>
        <View style={styles.chevron} />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />

          <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.handle} />
            <Text style={styles.title}>Тіл · Язык · Language</Text>

            {LANGUAGES.map((l) => {
              const active = l.code === lang;
              return (
                <TouchableOpacity
                  key={l.code}
                  activeOpacity={0.8}
                  onPress={() => {
                    setLang(l.code);
                    setOpen(false);
                  }}
                  style={[styles.row, active && styles.rowActive]}
                >
                  <View style={[styles.badge, active && styles.badgeActive]}>
                    <Text style={[styles.badgeText, active && styles.badgeTextActive]}>
                      {l.label}
                    </Text>
                  </View>
                  <Text style={[styles.name, active && styles.nameActive]}>{l.full}</Text>
                  <View style={[styles.radio, active && styles.radioActive]}>
                    {active ? <View style={styles.radioDot} /> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  pillText: { fontSize: 14, fontWeight: '700', color: colors.text, marginRight: 8 },
  chevron: {
    width: 7,
    height: 7,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.muted,
    transform: [{ rotate: '45deg' }, { translateY: -2 }],
  },

  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#e5e7eb',
    marginBottom: 18,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 16,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
    marginBottom: 10,
  },
  rowActive: { borderColor: colors.brand, backgroundColor: colors.brandSoft },

  badge: {
    width: 48,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#f1f2f4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  badgeActive: { backgroundColor: colors.brand },
  badgeText: { fontSize: 13, fontWeight: '800', color: colors.muted },
  badgeTextActive: { color: '#fff' },

  name: { flex: 1, fontSize: 17, fontWeight: '600', color: colors.text },
  nameActive: { color: colors.brandDark, fontWeight: '700' },

  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: colors.brand },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.brand },
});