import { StyleSheet, Text, View } from 'react-native';

export const BRAND = '#1a7a3c';

export function Logo() {
  return (
    <View style={styles.row}>
      <View style={styles.box}>
        <View style={styles.ticket}>
          <View style={styles.dashes}>
            <View style={styles.dash} />
            <View style={styles.dash} />
            <View style={styles.dash} />
          </View>
        </View>
      </View>
      <Text style={styles.name}>BiletFlow</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  box: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticket: {
    width: 20,
    height: 15,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashes: { gap: 1.5 },
  dash: { width: 2, height: 2, backgroundColor: '#fff' },
  name: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3, color: '#111827' },
});