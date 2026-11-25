import { router, usePathname } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, shadow } from '../constants/theme';
import { useAuth } from '../store/auth-context';
import { useLanguage } from '../store/language-context';
import { LanguagePicker } from './LanguagePicker';
import { Logo } from './Logo';

function Hamburger() {
  return (
    <View style={styles.burger}>
      <View style={styles.bar} />
      <View style={styles.bar} />
      <View style={styles.bar} />
    </View>
  );
}

export function AppHeader() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const auth = useAuth();
  const { t } = useLanguage();
  const [headerHeight, setHeaderHeight] = useState(62);
  const [menuOpen, setMenuOpen] = useState(false);
  const user = auth.user;
  const loggedIn = auth.isAuthenticated;
  const fullName = [user?.firstName, user?.lastName]
    .filter(Boolean)
    .join(' ');
  const initials = (
    fullName
      .split(' ')
      .filter(Boolean)
      .map((p) => p[0])
      .join('')
      .slice(0, 2) || (user?.email ?? '?').slice(0, 2)
  ).toUpperCase();

  const top = insets.top + headerHeight + 6;

    const NAV = [
    { key: 'catalog', label: t.navCatalog, href: '/' as const },
    { key: 'orders', label: t.navOrders, href: '/orders' as const },
    { key: 'myEvents', label: t.navMyEvents, href: '/events' as const },
    { key: 'profile', label: t.navProfile, href: '/profile' as const },
  ];

    function isActive(href: string | null) {
    if (!href) return false;
    return pathname === href;
  }

    function openItem(href: '/' | '/events' | '/orders' | '/profile') {
    setMenuOpen(false);
    if (isActive(href)) return;
    setTimeout(() => router.navigate(href), 250); 
  }

  async function handleLogout() {
    setMenuOpen(false);
    await auth.logout();
    // Reset navigation so no protected screen stays in history after logout.
    setTimeout(() => router.replace('/login'), 250);
  }

  return (
    <View style={styles.header} onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
      <TouchableOpacity activeOpacity={0.7} onPress={() => router.push('/')}>
        <Logo />
      </TouchableOpacity>

      <View style={styles.right}>
        <LanguagePicker />

        {loggedIn ? (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setMenuOpen(true)}
            style={styles.burgerButton}
            accessibilityLabel={t.menu}
          >
            <Hamburger />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push('/login')}
            style={styles.loginButton}
          >
            <Text style={styles.loginText}>{t.login}</Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setMenuOpen(false)}
      >
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)} />

          <View style={[styles.menu, { top }]}>
            <View style={styles.userCard}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <View style={styles.userInfo}>
                <Text style={styles.userName} numberOfLines={1}>
                  {fullName || user?.email || ''}
                </Text>
                {fullName && user?.email ? (
                  <Text style={styles.userEmail} numberOfLines={1}>
                    {user.email}
                  </Text>
                ) : null}
              </View>
            </View>

            {NAV.map((item) => {
              const active = isActive(item.href);
              const disabled = item.href === null;
              return (
                <TouchableOpacity
                  key={item.key}
                  activeOpacity={0.7}
                  disabled={disabled}
                  onPress={() => item.href && openItem(item.href)}
                  style={[styles.navItem, active && styles.navItemActive]}
                >
                  <Text
                    style={[
                      styles.navText,
                      active && styles.navTextActive,
                      disabled && styles.navTextDisabled,
                    ]}
                  >
                    {item.label}
                  </Text>
                  {disabled ? (
                    <View style={styles.soonBadge}>
                      <Text style={styles.soonText}>{t.soon}</Text>
                    </View>
                  ) : (
                    <Text style={[styles.arrow, active && styles.arrowActive]}>›</Text>
                  )}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity activeOpacity={0.8} onPress={handleLogout} style={styles.logout}>
              <Text style={styles.logoutText}>{t.logout}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  loginButton: {
    height: 42,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  burgerButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#f1f2f4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  burger: { gap: 4 },
  bar: { width: 18, height: 2, borderRadius: 1, backgroundColor: colors.ink },

  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.35)' },

  menu: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 10,
    ...shadow,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#f7f8fa',
    marginBottom: 8,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  userInfo: { flex: 1 },
  userName: { fontSize: 16, fontWeight: '700', color: colors.ink },
  userEmail: { fontSize: 13, color: colors.muted, marginTop: 2 },

  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  navItemActive: { backgroundColor: colors.brandSoft },
  navText: { fontSize: 16, fontWeight: '500', color: colors.text },
  navTextActive: { fontWeight: '700', color: colors.brandDark },
  navTextDisabled: { color: '#9ca3af' },
  arrow: { fontSize: 22, color: '#c4c8cf' },
  arrowActive: { color: colors.brand },
  soonBadge: {
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 8,
    backgroundColor: '#f1f2f4',
  },
  soonText: { fontSize: 11, fontWeight: '700', color: colors.muted },

  logout: {
    marginTop: 8,
    height: 50,
    borderRadius: 14,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: { fontSize: 15, fontWeight: '700', color: colors.danger },
});