import { View, Text, StyleSheet } from 'react-native';

// Placeholder for QR scanner
// TODO: implement QR scanner
export default function ScannerScreen() {
  return (
    <View style = {styles.container}>
      <Text>Qr scanner screen</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 8 },
});
